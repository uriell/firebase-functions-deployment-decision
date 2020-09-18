import nodeFetch from 'node-fetch';
import { createProgram } from 'typescript/lib/typescript';
import { resolve, basename, extname } from 'path';
import { sync as globSync } from 'globby';
import * as github from '@actions/github';
import * as core from '@actions/core';

import {
  GitHubCommitComparison,
  tsProgram,
  RelativeRef,
  ActionEnv,
} from './types';

const OUTPUT_KEY = 'functions_changed';

const DEFAULTS = {
  INDIVIDUAL_FUNCTION_REGEX:
    '(functions/(?!index\\.ts$).*\\.ts|(.*)\\.function\\.ts)$',
  FULL_DEPLOYMENT_REGEX:
    '((tsconfig|package).json|yarn.lock|src/(functions/)?index.ts)$',
};

const BEFORE_SHA = github.context.payload.before;
const AFTER_SHA = github.context.payload.after;
const COMPARE_URL = github.context.payload.repository?.compare_url;
const FILE_CHANGES_REGEX_FILTER = core.getInput('FILE_CHANGES_REGEX_FILTER');
const INDIVIDUAL_FUNCTION_GLOB = core.getInput('INDIVIDUAL_FUNCTION_GLOB');
const GITHUB_TOKEN = core.getInput('GITHUB_TOKEN');
const FULL_DEPLOYMENT_REGEX =
  core.getInput('FULL_DEPLOYMENT_REGEX') || DEFAULTS.FULL_DEPLOYMENT_REGEX;
const INDIVIDUAL_FUNCTION_REGEX =
  core.getInput('INDIVIDUAL_FUNCTION_REGEX') ||
  DEFAULTS.INDIVIDUAL_FUNCTION_REGEX;

const { GITHUB_WORKSPACE } = process.env as ActionEnv;

const getCompareUrl = (baseUrl: string, base: string, head: string): string =>
  baseUrl
    .replace('{base}', base.substr(0, 7))
    .replace('{head}', head.substr(0, 7));

const fetchGithubComparison = (
  url: string,
  authToken: string
): Promise<GitHubCommitComparison> =>
  nodeFetch(url, {
    headers: { Authorization: 'Bearer ' + authToken },
  }).then((res) => res.json());

async function getCodeFilesChanged(): Promise<string[]> {
  const compareUrl = getCompareUrl(COMPARE_URL, BEFORE_SHA, AFTER_SHA);
  core.debug('Fetching GitHub comparison through: ' + compareUrl);

  const { files } = await fetchGithubComparison(compareUrl, GITHUB_TOKEN);

  const filepaths = files.map((file) => file.filename);

  core.debug(filepaths.length + ' files changed in the comparison.');

  if (FILE_CHANGES_REGEX_FILTER) {
    const fileChangesFilter = new RegExp(FILE_CHANGES_REGEX_FILTER);

    core.debug(
      'Applying FILE_CHANGES_REGEX_FILTER: ' + FILE_CHANGES_REGEX_FILTER
    );

    return filepaths.filter((filepath) => fileChangesFilter.test(filepath));
  }

  return filepaths;
}

function findFunctionsChanged(
  originPaths: string[],
  references: RelativeRef
): string[] {
  const functionsChanged = [];
  const individualFunction = new RegExp(INDIVIDUAL_FUNCTION_REGEX);

  const dependents = originPaths
    .map((filepath) => references[filepath])
    .filter(Boolean)
    .reduce((acc, arr) => acc.concat(arr), [])
    .filter((item, index, arr) => arr.indexOf(item) === index);

  // files that are not function exports
  const nonFunctionDependents = dependents.filter(
    (filepath) => !individualFunction.test(filepath)
  );

  functionsChanged.push(
    ...dependents.filter((filepath) => individualFunction.test(filepath)),
    ...originPaths.filter((filepath) => individualFunction.test(filepath))
  );

  if (nonFunctionDependents.length) {
    functionsChanged.push(
      ...findFunctionsChanged(nonFunctionDependents, references)
    );
  }

  const functionNames = functionsChanged
    .map((filepath) => basename(filepath, extname(filepath)))
    .filter((item, index, arr) => arr.indexOf(item) === index);

  return functionNames;
}

function processChangedFiles(filepaths: string[]): string[] {
  if (!filepaths.length) {
    core.debug('Empty filepaths array provided to "processChangedFiles()"');

    return [];
  }

  // TODO: change this into a glob environment variable
  const fullDeployment = new RegExp(FULL_DEPLOYMENT_REGEX);

  if (filepaths.some((filepath) => fullDeployment.test(filepath))) {
    core.debug('File changes detected that should trigger a full deployment.');

    return [];
  }

  const changedFilepaths = filepaths.map((filepath) =>
    resolve(GITHUB_WORKSPACE, filepath)
  );
  const functionFilePaths = globSync(INDIVIDUAL_FUNCTION_GLOB, {
    cwd: GITHUB_WORKSPACE,
  });
  const tsProgram = createProgram(functionFilePaths, {});
  const refFileMap = (tsProgram as tsProgram).getRefFileMap();

  if (!refFileMap) {
    console.debug('No Reference File Map was generated.');
    return [];
  }

  const relativeReferences = [...Array.from(refFileMap.entries())]
    .filter((pair) =>
      pair[1].every(
        (ref) =>
          !ref.file.includes('node_modules') &&
          !ref.referencedFileName.includes('node_modules')
      )
    )
    .map(([origin, refFiles]) => [origin, refFiles.map((ref) => ref.file)])
    .reduce((acc, pair) => ({ ...acc, [pair[0] as string]: pair[1] }), {});

  return findFunctionsChanged(changedFilepaths, relativeReferences);
}

(() => {
  if (!INDIVIDUAL_FUNCTION_GLOB) {
    return core.warning('INDIVIDUAL_FUNCTION_GLOB was not set.');
  }

  if (!GITHUB_TOKEN) {
    return core.warning('GITHUB_TOKEN was not set.');
  }

  getCodeFilesChanged()
    .then(processChangedFiles)
    .then((changedFunctionNames) => {
      if (!changedFunctionNames.length) {
        console.debug(
          'No specific functions changed, so all will be deployed.'
        );

        return core.setOutput(OUTPUT_KEY, '');
      }

      console.debug(
        changedFunctionNames.length + ' functions changed and will deploy.'
      );

      core.setOutput(OUTPUT_KEY, ':' + changedFunctionNames.join(','));
    })
    .catch((err) => {
      core.error(
        'An error has occurred when deciding which functions to deploy..'
      );

      core.error(err);
    });
})();
