# In this repo

* SPA using Svelte3
* Lazy loaded routes
* RXJS for state management
* Shared dependencies between routes

This is intended to experiment with methods of separating a project into multiple, lazy-loaded routes that have shared dependencies.

start by reading `./main/src/app/main.js`
That is the index that bootstraps everything else.

`./add` is supposed to simulate a project that could be managed in a seperate git repo where the
compiled JS is hosted on its own http server/s3 bucket or whatever.

By extension I imagine `./main` to also be a seperate repo.

For clarity this is important because professionally, it's a massive challenge working with other frameworks on large projects that span multiple teams.
Normally you'd have a single repo and everyone works off their part, but sharing a release cycle is annoying, so being able to split a project into multiple projects and lazy load them while preserving state is neat.

Also I didn't know how to configure rollup to spit out two JS/CSS bundles for multiple entry points so I just made two projects.

`./*/platform` are shared dependencies that would otherwise be stored in `node_modules`


# Setup

```
cd add
npm install
npm run deploy
cd ..

cd main 
npm install  
npm run dev
cd ..
```

I disabled the http server because I couldn't figure out SPA routing, so I just spin up a new terminal and use

```
npx http-server ./main/public
```