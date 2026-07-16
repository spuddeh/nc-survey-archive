// <define:__ROUTES__>
var define_ROUTES_default = {
  version: 1,
  include: ["/api/*"],
  exclude: []
};

// C:/Users/spudd/AppData/Local/npm-cache/_npx/d77349f55c2be1c0/node_modules/wrangler/templates/pages-dev-pipeline.ts
import worker from "D:\\Modding\\nc-zoning-survey\\.wrangler\\tmp\\pages-zABe1j\\functionsWorker-0.9327466824787756.mjs";
import { isRoutingRuleMatch } from "C:\\Users\\spudd\\AppData\\Local\\npm-cache\\_npx\\d77349f55c2be1c0\\node_modules\\wrangler\\templates\\pages-dev-util.ts";
export * from "D:\\Modding\\nc-zoning-survey\\.wrangler\\tmp\\pages-zABe1j\\functionsWorker-0.9327466824787756.mjs";
var routes = define_ROUTES_default;
var pages_dev_pipeline_default = {
  fetch(request, env, context) {
    const { pathname } = new URL(request.url);
    for (const exclude of routes.exclude) {
      if (isRoutingRuleMatch(pathname, exclude)) {
        return env.ASSETS.fetch(request);
      }
    }
    for (const include of routes.include) {
      if (isRoutingRuleMatch(pathname, include)) {
        const workerAsHandler = worker;
        if (workerAsHandler.fetch === void 0) {
          throw new TypeError("Entry point missing `fetch` handler");
        }
        return workerAsHandler.fetch(request, env, context);
      }
    }
    return env.ASSETS.fetch(request);
  }
};
export {
  pages_dev_pipeline_default as default
};
//# sourceMappingURL=4p213l82fnd.js.map
