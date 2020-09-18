# firebase-functions-deployment-decision

A GitHub Action that reads your TypeScript diff &amp; code to decide which functions to deploy automagically.

## How it works

After correctly configuring this action, it will start reading your file diffs and code using TypeScript's parser to map out relative file references and understand which files affected which functions.

For it to work, you should split each function as a separate file, and the file name should be similar (or the same) to your function.

## Inputs

```yml
GITHUB_TOKEN:
  description: 'A GitHub token to fetch the commit comparison and read file changes.'
  required: true
  example: ${{ github.token }}
INDIVIDUAL_FUNCTION_GLOB:
  description: 'A glob that matches individual function files.'
  required: true
  example: 'packages/functions/src/functions/*.ts'
FILE_CHANGES_FILTER_REGEX:
  description: 'An optional Regular Expression to filter your file changes.'
  required: false
  example: 'packages/functions/src/v2/functions'
INDIVIDUAL_FUNCTION_REGEX:
  description: 'An optional Regular Expression to match your individual function files.'
  required: false
  default: '(functions/(?!index\\.ts$).*\\.ts|(.*)\\.function\\.ts)$'
FULL_DEPLOYMENT_REGEX:
  description: 'An optional Regular Expression to match when a full deployment will be required.'
  required: false
  default: '((tsconfig|package).json|yarn.lock|src/(functions/)?index.ts)$'
```

## Outputs

```yml
FUNCTIONS_CHANGED:
  description: 'A colon-prefixed list of comma-separated function names to append to your "deploy --only functions"'
```

## Example workflow (monorepo with lerna)

```yml
name: CD (Functions)
on:
  push:
    branches:
      - master
    paths:
      - '.github/workflows/functions.continuous-deployment.yml'
      - 'packages/functions/**'
      - 'firebase.json'
      - 'package.json'
      - '.firebaserc'
jobs:
  deploy:
    name: 'Install > Deploy'
    runs-on: ubuntu-latest
    strategy:
      fail-fast: true
      matrix:
        firebase_component: ['functions']
    steps:
      - name: Checkout the code
        uses: actions/checkout@v2
      - name: Setup node v10.x environment
        uses: actions/setup-node@v1
        with:
          node-version: '10.x'
      - name: Restore lerna-style dependencies
        uses: actions/cache@master
        id: lerna_cache
        with:
          path: |
            node_modules
            packages/functions/node_modules
          key: ${{ runner.os }}-${{ hashFiles('yarn.lock') }}-${{ hashFiles('packages/functions/yarn.lock') }}
      - name: Install root package dependencies
        run: yarn install
        if: steps.lerna_cache.outputs.cache-hit != 'true'
      - name: Install inner package dependencies
        run: yarn run bootstrap --scope ${{ matrix.firebase_component }}
        if: steps.lerna_cache.outputs.cache-hit != 'true'
      - name: Decide functions to update v2
        id: FUNCTIONS_CHANGED
        uses: UriellViana/firebase-functions-deployment-decision@v1.0.1
        with:
          GITHUB_TOKEN: ${{ github.token }}
          INDIVIDUAL_FUNCTION_GLOB: 'packages/functions/src/functions/*.ts'
      - name: Deploy ${{ matrix.firebase_component }} to Firebase
        run: yarn run deploy:ci --token=$FIREBASE_TOKEN --only ${{ matrix.firebase_component }}${{ steps.functions_changed.outputs.FUNCTIONS_CHANGED }}
        env:
          FIREBASE_TOKEN: ${{ secrets.FIREBASE_TOKEN }}
```
