(function () {
  'use strict';

  var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

  function isPushStateAvailable() {
    return !!(typeof window !== 'undefined' && window.history && window.history.pushState);
  }

  function Navigo(r, useHash, hash) {
    this.root = null;
    this._routes = [];
    this._useHash = useHash;
    this._hash = typeof hash === 'undefined' ? '#' : hash;
    this._paused = false;
    this._destroyed = false;
    this._lastRouteResolved = null;
    this._notFoundHandler = null;
    this._defaultHandler = null;
    this._usePushState = !useHash && isPushStateAvailable();
    this._onLocationChange = this._onLocationChange.bind(this);
    this._genericHooks = null;
    this._historyAPIUpdateMethod = 'pushState';

    if (r) {
      this.root = useHash ? r.replace(/\/$/, '/' + this._hash) : r.replace(/\/$/, '');
    } else if (useHash) {
      this.root = this._cLoc().split(this._hash)[0].replace(/\/$/, '/' + this._hash);
    }

    this._listen();
    this.updatePageLinks();
  }

  function clean(s) {
    if (s instanceof RegExp) return s;
    return s.replace(/\/+$/, '').replace(/^\/+/, '^/');
  }

  function regExpResultToParams(match, names) {
    if (names.length === 0) return null;
    if (!match) return null;
    return match.slice(1, match.length).reduce(function (params, value, index) {
      if (params === null) params = {};
      params[names[index]] = decodeURIComponent(value);
      return params;
    }, null);
  }

  function replaceDynamicURLParts(route) {
    var paramNames = [],
        regexp;

    if (route instanceof RegExp) {
      regexp = route;
    } else {
      regexp = new RegExp(route.replace(Navigo.PARAMETER_REGEXP, function (full, dots, name) {
        paramNames.push(name);
        return Navigo.REPLACE_VARIABLE_REGEXP;
      }).replace(Navigo.WILDCARD_REGEXP, Navigo.REPLACE_WILDCARD) + Navigo.FOLLOWED_BY_SLASH_REGEXP, Navigo.MATCH_REGEXP_FLAGS);
    }
    return { regexp: regexp, paramNames: paramNames };
  }

  function getUrlDepth(url) {
    return url.replace(/\/$/, '').split('/').length;
  }

  function compareUrlDepth(urlA, urlB) {
    return getUrlDepth(urlB) - getUrlDepth(urlA);
  }

  function findMatchedRoutes(url) {
    var routes = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : [];

    return routes.map(function (route) {
      var _replaceDynamicURLPar = replaceDynamicURLParts(clean(route.route)),
          regexp = _replaceDynamicURLPar.regexp,
          paramNames = _replaceDynamicURLPar.paramNames;

      var match = url.replace(/^\/+/, '/').match(regexp);
      var params = regExpResultToParams(match, paramNames);

      return match ? { match: match, route: route, params: params } : false;
    }).filter(function (m) {
      return m;
    });
  }

  function match(url, routes) {
    return findMatchedRoutes(url, routes)[0] || false;
  }

  function root(url, routes) {
    var matched = routes.map(function (route) {
      return route.route === '' || route.route === '*' ? url : url.split(new RegExp(route.route + '($|\/)'))[0];
    });
    var fallbackURL = clean(url);

    if (matched.length > 1) {
      return matched.reduce(function (result, url) {
        if (result.length > url.length) result = url;
        return result;
      }, matched[0]);
    } else if (matched.length === 1) {
      return matched[0];
    }
    return fallbackURL;
  }

  function isHashChangeAPIAvailable() {
    return typeof window !== 'undefined' && 'onhashchange' in window;
  }

  function extractGETParameters(url) {
    return url.split(/\?(.*)?$/).slice(1).join('');
  }

  function getOnlyURL(url, useHash, hash) {
    var onlyURL = url,
        split;
    var cleanGETParam = function cleanGETParam(str) {
      return str.split(/\?(.*)?$/)[0];
    };

    if (typeof hash === 'undefined') {
      // To preserve BC
      hash = '#';
    }

    if (isPushStateAvailable() && !useHash) {
      onlyURL = cleanGETParam(url).split(hash)[0];
    } else {
      split = url.split(hash);
      onlyURL = split.length > 1 ? cleanGETParam(split[1]) : cleanGETParam(split[0]);
    }

    return onlyURL;
  }

  function manageHooks(handler, hooks, params) {
    if (hooks && (typeof hooks === 'undefined' ? 'undefined' : _typeof(hooks)) === 'object') {
      if (hooks.before) {
        hooks.before(function () {
          var shouldRoute = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : true;

          if (!shouldRoute) return;
          handler();
          hooks.after && hooks.after(params);
        }, params);
        return;
      } else if (hooks.after) {
        handler();
        hooks.after && hooks.after(params);
        return;
      }
    }
    handler();
  }

  function isHashedRoot(url, useHash, hash) {
    if (isPushStateAvailable() && !useHash) {
      return false;
    }

    if (!url.match(hash)) {
      return false;
    }

    var split = url.split(hash);

    return split.length < 2 || split[1] === '';
  }

  Navigo.prototype = {
    helpers: {
      match: match,
      root: root,
      clean: clean,
      getOnlyURL: getOnlyURL
    },
    navigate: function navigate(path, absolute) {
      var to;

      path = path || '';
      if (this._usePushState) {
        to = (!absolute ? this._getRoot() + '/' : '') + path.replace(/^\/+/, '/');
        to = to.replace(/([^:])(\/{2,})/g, '$1/');
        history[this._historyAPIUpdateMethod]({}, '', to);
        this.resolve();
      } else if (typeof window !== 'undefined') {
        path = path.replace(new RegExp('^' + this._hash), '');
        window.location.href = window.location.href.replace(/#$/, '').replace(new RegExp(this._hash + '.*$'), '') + this._hash + path;
      }
      return this;
    },
    on: function on() {
      var _this = this;

      for (var _len = arguments.length, args = Array(_len), _key = 0; _key < _len; _key++) {
        args[_key] = arguments[_key];
      }

      if (typeof args[0] === 'function') {
        this._defaultHandler = { handler: args[0], hooks: args[1] };
      } else if (args.length >= 2) {
        if (args[0] === '/') {
          var func = args[1];

          if (_typeof(args[1]) === 'object') {
            func = args[1].uses;
          }

          this._defaultHandler = { handler: func, hooks: args[2] };
        } else {
          this._add(args[0], args[1], args[2]);
        }
      } else if (_typeof(args[0]) === 'object') {
        var orderedRoutes = Object.keys(args[0]).sort(compareUrlDepth);

        orderedRoutes.forEach(function (route) {
          _this.on(route, args[0][route]);
        });
      }
      return this;
    },
    off: function off(handler) {
      if (this._defaultHandler !== null && handler === this._defaultHandler.handler) {
        this._defaultHandler = null;
      } else if (this._notFoundHandler !== null && handler === this._notFoundHandler.handler) {
        this._notFoundHandler = null;
      }
      this._routes = this._routes.reduce(function (result, r) {
        if (r.handler !== handler) result.push(r);
        return result;
      }, []);
      return this;
    },
    notFound: function notFound(handler, hooks) {
      this._notFoundHandler = { handler: handler, hooks: hooks };
      return this;
    },
    resolve: function resolve(current) {
      var _this2 = this;

      var handler, m;
      var url = (current || this._cLoc()).replace(this._getRoot(), '');

      if (this._useHash) {
        url = url.replace(new RegExp('^\/' + this._hash), '/');
      }

      var GETParameters = extractGETParameters(current || this._cLoc());
      var onlyURL = getOnlyURL(url, this._useHash, this._hash);

      if (this._paused) return false;

      if (this._lastRouteResolved && onlyURL === this._lastRouteResolved.url && GETParameters === this._lastRouteResolved.query) {
        if (this._lastRouteResolved.hooks && this._lastRouteResolved.hooks.already) {
          this._lastRouteResolved.hooks.already(this._lastRouteResolved.params);
        }
        return false;
      }

      m = match(onlyURL, this._routes);

      if (m) {
        this._callLeave();
        this._lastRouteResolved = {
          url: onlyURL,
          query: GETParameters,
          hooks: m.route.hooks,
          params: m.params,
          name: m.route.name
        };
        handler = m.route.handler;
        manageHooks(function () {
          manageHooks(function () {
            m.route.route instanceof RegExp ? handler.apply(undefined, m.match.slice(1, m.match.length)) : handler(m.params, GETParameters);
          }, m.route.hooks, m.params, _this2._genericHooks);
        }, this._genericHooks, m.params);
        return m;
      } else if (this._defaultHandler && (onlyURL === '' || onlyURL === '/' || onlyURL === this._hash || isHashedRoot(onlyURL, this._useHash, this._hash))) {
        manageHooks(function () {
          manageHooks(function () {
            _this2._callLeave();
            _this2._lastRouteResolved = { url: onlyURL, query: GETParameters, hooks: _this2._defaultHandler.hooks };
            _this2._defaultHandler.handler(GETParameters);
          }, _this2._defaultHandler.hooks);
        }, this._genericHooks);
        return true;
      } else if (this._notFoundHandler) {
        manageHooks(function () {
          manageHooks(function () {
            _this2._callLeave();
            _this2._lastRouteResolved = { url: onlyURL, query: GETParameters, hooks: _this2._notFoundHandler.hooks };
            _this2._notFoundHandler.handler(GETParameters);
          }, _this2._notFoundHandler.hooks);
        }, this._genericHooks);
      }
      return false;
    },
    destroy: function destroy() {
      this._routes = [];
      this._destroyed = true;
      this._lastRouteResolved = null;
      this._genericHooks = null;
      clearTimeout(this._listeningInterval);
      if (typeof window !== 'undefined') {
        window.removeEventListener('popstate', this._onLocationChange);
        window.removeEventListener('hashchange', this._onLocationChange);
      }
    },
    updatePageLinks: function updatePageLinks() {
      var self = this;

      if (typeof document === 'undefined') return;

      this._findLinks().forEach(function (link) {
        if (!link.hasListenerAttached) {
          link.addEventListener('click', function (e) {
            if ((e.ctrlKey || e.metaKey) && e.target.tagName.toLowerCase() == 'a') {
              return false;
            }
            var location = self.getLinkPath(link);

            if (!self._destroyed) {
              e.preventDefault();
              self.navigate(location.replace(/\/+$/, '').replace(/^\/+/, '/'));
            }
          });
          link.hasListenerAttached = true;
        }
      });
    },
    generate: function generate(name) {
      var data = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};

      var result = this._routes.reduce(function (result, route) {
        var key;

        if (route.name === name) {
          result = route.route;
          for (key in data) {
            result = result.toString().replace(':' + key, data[key]);
          }
        }
        return result;
      }, '');

      return this._useHash ? this._hash + result : result;
    },
    link: function link(path) {
      return this._getRoot() + path;
    },
    pause: function pause() {
      var status = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : true;

      this._paused = status;
      if (status) {
        this._historyAPIUpdateMethod = 'replaceState';
      } else {
        this._historyAPIUpdateMethod = 'pushState';
      }
    },
    resume: function resume() {
      this.pause(false);
    },
    historyAPIUpdateMethod: function historyAPIUpdateMethod(value) {
      if (typeof value === 'undefined') return this._historyAPIUpdateMethod;
      this._historyAPIUpdateMethod = value;
      return value;
    },
    disableIfAPINotAvailable: function disableIfAPINotAvailable() {
      if (!isPushStateAvailable()) {
        this.destroy();
      }
    },
    lastRouteResolved: function lastRouteResolved() {
      return this._lastRouteResolved;
    },
    getLinkPath: function getLinkPath(link) {
      return link.getAttribute('href');
    },
    hooks: function hooks(_hooks) {
      this._genericHooks = _hooks;
    },

    _add: function _add(route) {
      var handler = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : null;
      var hooks = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : null;

      if (typeof route === 'string') {
        route = encodeURI(route);
      }
      this._routes.push((typeof handler === 'undefined' ? 'undefined' : _typeof(handler)) === 'object' ? {
        route: route,
        handler: handler.uses,
        name: handler.as,
        hooks: hooks || handler.hooks
      } : { route: route, handler: handler, hooks: hooks });

      return this._add;
    },
    _getRoot: function _getRoot() {
      if (this.root !== null) return this.root;
      this.root = root(this._cLoc().split('?')[0], this._routes);
      return this.root;
    },
    _listen: function _listen() {
      var _this3 = this;

      if (this._usePushState) {
        window.addEventListener('popstate', this._onLocationChange);
      } else if (isHashChangeAPIAvailable()) {
        window.addEventListener('hashchange', this._onLocationChange);
      } else {
        var cached = this._cLoc(),
            current = void 0,
            _check = void 0;

        _check = function check() {
          current = _this3._cLoc();
          if (cached !== current) {
            cached = current;
            _this3.resolve();
          }
          _this3._listeningInterval = setTimeout(_check, 200);
        };
        _check();
      }
    },
    _cLoc: function _cLoc() {
      if (typeof window !== 'undefined') {
        if (typeof window.__NAVIGO_WINDOW_LOCATION_MOCK__ !== 'undefined') {
          return window.__NAVIGO_WINDOW_LOCATION_MOCK__;
        }
        return clean(window.location.href);
      }
      return '';
    },
    _findLinks: function _findLinks() {
      return [].slice.call(document.querySelectorAll('[data-navigo]'));
    },
    _onLocationChange: function _onLocationChange() {
      this.resolve();
    },
    _callLeave: function _callLeave() {
      var lastRouteResolved = this._lastRouteResolved;

      if (lastRouteResolved && lastRouteResolved.hooks && lastRouteResolved.hooks.leave) {
        lastRouteResolved.hooks.leave(lastRouteResolved.params);
      }
    }
  };

  Navigo.PARAMETER_REGEXP = /([:*])(\w+)/g;
  Navigo.WILDCARD_REGEXP = /\*/g;
  Navigo.REPLACE_VARIABLE_REGEXP = '([^\/]+)';
  Navigo.REPLACE_WILDCARD = '(?:.*)';
  Navigo.FOLLOWED_BY_SLASH_REGEXP = '(?:\/$|$)';
  Navigo.MATCH_REGEXP_FLAGS = '';

  const loadCSS = link => new Promise(res => {
      if (document.querySelector(`link[href="${link}"]`)) {
          res();
          return
      }
      const s = document.createElement('link');
      s.href = link;
      document.body.appendChild(s);
      res();
  });

  const loadScript = link => new Promise(res => {
      if (document.querySelector(`script[src="${link}"]`)) {
          res();
          return
      }
      const s = document.createElement('script');
      s.onload = e => res(e);
      s.src = link;
      document.body.appendChild(s);
  });

  const load = async items => {
      for (const item of items) {
          if (item.includes('.css')) {
              loadCSS(item);
          }
          if (item.includes('.js')) {
              await loadScript(item);
          }
      }
  };

  const create = (outlet) => {
      const r = {
          outlet,
          engine: new Navigo(window.location.origin),
          current: null,
          routes: []
      };

      const navigate = (path) => {
          r.engine.navigate(path, true);
      };

      const unmount = () => {
          if (!r.current) {
              return
          }
          r.current.$destroy();
      };

      const mount = async (route) => {
          if (route.load) {
              await load(route.load);
          }
          await unmount();
          const c = route.component();
          r.current = new c({
              target: r.outlet,
              props: {
                  ...route.require
              }
          });
          window.page = r.current;
      };  

      const path = (path, route) => {
          r.routes.push({ path, ...route });
      };

      const init = () => {
          if (!outlet) {
              r.outlet = document.createElement('div');
              document.body.appendChild(r.outlet);
          }
          const table = {};
          for (const route of r.routes) {
              if (route.redirectTo) {
                  table[route.path] = () => navigate(route.redirectTo);
              }
              if (route.component) {
                  table[route.path] = () => mount(route);
              }

          }
          r.engine.on(table).resolve();
      };

      r.navigate = navigate;
      r.init = init;
      r.path = path;
      return r
  };

  /*! *****************************************************************************
  Copyright (c) Microsoft Corporation. All rights reserved.
  Licensed under the Apache License, Version 2.0 (the "License"); you may not use
  this file except in compliance with the License. You may obtain a copy of the
  License at http://www.apache.org/licenses/LICENSE-2.0

  THIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
  KIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED
  WARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,
  MERCHANTABLITY OR NON-INFRINGEMENT.

  See the Apache Version 2.0 License for specific language governing permissions
  and limitations under the License.
  ***************************************************************************** */
  /* global Reflect, Promise */

  var extendStatics = function(d, b) {
      extendStatics = Object.setPrototypeOf ||
          ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
          function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
      return extendStatics(d, b);
  };

  function __extends(d, b) {
      extendStatics(d, b);
      function __() { this.constructor = d; }
      d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
  }

  /** PURE_IMPORTS_START  PURE_IMPORTS_END */
  function isFunction(x) {
      return typeof x === 'function';
  }
  //# sourceMappingURL=isFunction.js.map

  /** PURE_IMPORTS_START  PURE_IMPORTS_END */
  var _enable_super_gross_mode_that_will_cause_bad_things = false;
  var config = {
      Promise: undefined,
      set useDeprecatedSynchronousErrorHandling(value) {
          if (value) {
              var error = /*@__PURE__*/ new Error();
              /*@__PURE__*/ console.warn('DEPRECATED! RxJS was set to use deprecated synchronous error handling behavior by code at: \n' + error.stack);
          }
          _enable_super_gross_mode_that_will_cause_bad_things = value;
      },
      get useDeprecatedSynchronousErrorHandling() {
          return _enable_super_gross_mode_that_will_cause_bad_things;
      },
  };
  //# sourceMappingURL=config.js.map

  /** PURE_IMPORTS_START  PURE_IMPORTS_END */
  function hostReportError(err) {
      setTimeout(function () { throw err; }, 0);
  }
  //# sourceMappingURL=hostReportError.js.map

  /** PURE_IMPORTS_START _config,_util_hostReportError PURE_IMPORTS_END */
  var empty = {
      closed: true,
      next: function (value) { },
      error: function (err) {
          if (config.useDeprecatedSynchronousErrorHandling) {
              throw err;
          }
          else {
              hostReportError(err);
          }
      },
      complete: function () { }
  };
  //# sourceMappingURL=Observer.js.map

  /** PURE_IMPORTS_START  PURE_IMPORTS_END */
  var isArray = Array.isArray || (function (x) { return x && typeof x.length === 'number'; });
  //# sourceMappingURL=isArray.js.map

  /** PURE_IMPORTS_START  PURE_IMPORTS_END */
  function isObject(x) {
      return x !== null && typeof x === 'object';
  }
  //# sourceMappingURL=isObject.js.map

  /** PURE_IMPORTS_START  PURE_IMPORTS_END */
  function UnsubscriptionErrorImpl(errors) {
      Error.call(this);
      this.message = errors ?
          errors.length + " errors occurred during unsubscription:\n" + errors.map(function (err, i) { return i + 1 + ") " + err.toString(); }).join('\n  ') : '';
      this.name = 'UnsubscriptionError';
      this.errors = errors;
      return this;
  }
  UnsubscriptionErrorImpl.prototype = /*@__PURE__*/ Object.create(Error.prototype);
  var UnsubscriptionError = UnsubscriptionErrorImpl;
  //# sourceMappingURL=UnsubscriptionError.js.map

  /** PURE_IMPORTS_START _util_isArray,_util_isObject,_util_isFunction,_util_UnsubscriptionError PURE_IMPORTS_END */
  var Subscription = /*@__PURE__*/ (function () {
      function Subscription(unsubscribe) {
          this.closed = false;
          this._parentOrParents = null;
          this._subscriptions = null;
          if (unsubscribe) {
              this._unsubscribe = unsubscribe;
          }
      }
      Subscription.prototype.unsubscribe = function () {
          var errors;
          if (this.closed) {
              return;
          }
          var _a = this, _parentOrParents = _a._parentOrParents, _unsubscribe = _a._unsubscribe, _subscriptions = _a._subscriptions;
          this.closed = true;
          this._parentOrParents = null;
          this._subscriptions = null;
          if (_parentOrParents instanceof Subscription) {
              _parentOrParents.remove(this);
          }
          else if (_parentOrParents !== null) {
              for (var index = 0; index < _parentOrParents.length; ++index) {
                  var parent_1 = _parentOrParents[index];
                  parent_1.remove(this);
              }
          }
          if (isFunction(_unsubscribe)) {
              try {
                  _unsubscribe.call(this);
              }
              catch (e) {
                  errors = e instanceof UnsubscriptionError ? flattenUnsubscriptionErrors(e.errors) : [e];
              }
          }
          if (isArray(_subscriptions)) {
              var index = -1;
              var len = _subscriptions.length;
              while (++index < len) {
                  var sub = _subscriptions[index];
                  if (isObject(sub)) {
                      try {
                          sub.unsubscribe();
                      }
                      catch (e) {
                          errors = errors || [];
                          if (e instanceof UnsubscriptionError) {
                              errors = errors.concat(flattenUnsubscriptionErrors(e.errors));
                          }
                          else {
                              errors.push(e);
                          }
                      }
                  }
              }
          }
          if (errors) {
              throw new UnsubscriptionError(errors);
          }
      };
      Subscription.prototype.add = function (teardown) {
          var subscription = teardown;
          switch (typeof teardown) {
              case 'function':
                  subscription = new Subscription(teardown);
              case 'object':
                  if (subscription === this || subscription.closed || typeof subscription.unsubscribe !== 'function') {
                      return subscription;
                  }
                  else if (this.closed) {
                      subscription.unsubscribe();
                      return subscription;
                  }
                  else if (!(subscription instanceof Subscription)) {
                      var tmp = subscription;
                      subscription = new Subscription();
                      subscription._subscriptions = [tmp];
                  }
                  break;
              default: {
                  if (!teardown) {
                      return Subscription.EMPTY;
                  }
                  throw new Error('unrecognized teardown ' + teardown + ' added to Subscription.');
              }
          }
          var _parentOrParents = subscription._parentOrParents;
          if (_parentOrParents === null) {
              subscription._parentOrParents = this;
          }
          else if (_parentOrParents instanceof Subscription) {
              if (_parentOrParents === this) {
                  return subscription;
              }
              subscription._parentOrParents = [_parentOrParents, this];
          }
          else if (_parentOrParents.indexOf(this) === -1) {
              _parentOrParents.push(this);
          }
          else {
              return subscription;
          }
          var subscriptions = this._subscriptions;
          if (subscriptions === null) {
              this._subscriptions = [subscription];
          }
          else {
              subscriptions.push(subscription);
          }
          return subscription;
      };
      Subscription.prototype.remove = function (subscription) {
          var subscriptions = this._subscriptions;
          if (subscriptions) {
              var subscriptionIndex = subscriptions.indexOf(subscription);
              if (subscriptionIndex !== -1) {
                  subscriptions.splice(subscriptionIndex, 1);
              }
          }
      };
      Subscription.EMPTY = (function (empty) {
          empty.closed = true;
          return empty;
      }(new Subscription()));
      return Subscription;
  }());
  function flattenUnsubscriptionErrors(errors) {
      return errors.reduce(function (errs, err) { return errs.concat((err instanceof UnsubscriptionError) ? err.errors : err); }, []);
  }
  //# sourceMappingURL=Subscription.js.map

  /** PURE_IMPORTS_START  PURE_IMPORTS_END */
  var rxSubscriber = typeof Symbol === 'function'
      ? /*@__PURE__*/ Symbol('rxSubscriber')
      : '@@rxSubscriber_' + /*@__PURE__*/ Math.random();
  //# sourceMappingURL=rxSubscriber.js.map

  /** PURE_IMPORTS_START tslib,_util_isFunction,_Observer,_Subscription,_internal_symbol_rxSubscriber,_config,_util_hostReportError PURE_IMPORTS_END */
  var Subscriber = /*@__PURE__*/ (function (_super) {
      __extends(Subscriber, _super);
      function Subscriber(destinationOrNext, error, complete) {
          var _this = _super.call(this) || this;
          _this.syncErrorValue = null;
          _this.syncErrorThrown = false;
          _this.syncErrorThrowable = false;
          _this.isStopped = false;
          switch (arguments.length) {
              case 0:
                  _this.destination = empty;
                  break;
              case 1:
                  if (!destinationOrNext) {
                      _this.destination = empty;
                      break;
                  }
                  if (typeof destinationOrNext === 'object') {
                      if (destinationOrNext instanceof Subscriber) {
                          _this.syncErrorThrowable = destinationOrNext.syncErrorThrowable;
                          _this.destination = destinationOrNext;
                          destinationOrNext.add(_this);
                      }
                      else {
                          _this.syncErrorThrowable = true;
                          _this.destination = new SafeSubscriber(_this, destinationOrNext);
                      }
                      break;
                  }
              default:
                  _this.syncErrorThrowable = true;
                  _this.destination = new SafeSubscriber(_this, destinationOrNext, error, complete);
                  break;
          }
          return _this;
      }
      Subscriber.prototype[rxSubscriber] = function () { return this; };
      Subscriber.create = function (next, error, complete) {
          var subscriber = new Subscriber(next, error, complete);
          subscriber.syncErrorThrowable = false;
          return subscriber;
      };
      Subscriber.prototype.next = function (value) {
          if (!this.isStopped) {
              this._next(value);
          }
      };
      Subscriber.prototype.error = function (err) {
          if (!this.isStopped) {
              this.isStopped = true;
              this._error(err);
          }
      };
      Subscriber.prototype.complete = function () {
          if (!this.isStopped) {
              this.isStopped = true;
              this._complete();
          }
      };
      Subscriber.prototype.unsubscribe = function () {
          if (this.closed) {
              return;
          }
          this.isStopped = true;
          _super.prototype.unsubscribe.call(this);
      };
      Subscriber.prototype._next = function (value) {
          this.destination.next(value);
      };
      Subscriber.prototype._error = function (err) {
          this.destination.error(err);
          this.unsubscribe();
      };
      Subscriber.prototype._complete = function () {
          this.destination.complete();
          this.unsubscribe();
      };
      Subscriber.prototype._unsubscribeAndRecycle = function () {
          var _parentOrParents = this._parentOrParents;
          this._parentOrParents = null;
          this.unsubscribe();
          this.closed = false;
          this.isStopped = false;
          this._parentOrParents = _parentOrParents;
          return this;
      };
      return Subscriber;
  }(Subscription));
  var SafeSubscriber = /*@__PURE__*/ (function (_super) {
      __extends(SafeSubscriber, _super);
      function SafeSubscriber(_parentSubscriber, observerOrNext, error, complete) {
          var _this = _super.call(this) || this;
          _this._parentSubscriber = _parentSubscriber;
          var next;
          var context = _this;
          if (isFunction(observerOrNext)) {
              next = observerOrNext;
          }
          else if (observerOrNext) {
              next = observerOrNext.next;
              error = observerOrNext.error;
              complete = observerOrNext.complete;
              if (observerOrNext !== empty) {
                  context = Object.create(observerOrNext);
                  if (isFunction(context.unsubscribe)) {
                      _this.add(context.unsubscribe.bind(context));
                  }
                  context.unsubscribe = _this.unsubscribe.bind(_this);
              }
          }
          _this._context = context;
          _this._next = next;
          _this._error = error;
          _this._complete = complete;
          return _this;
      }
      SafeSubscriber.prototype.next = function (value) {
          if (!this.isStopped && this._next) {
              var _parentSubscriber = this._parentSubscriber;
              if (!config.useDeprecatedSynchronousErrorHandling || !_parentSubscriber.syncErrorThrowable) {
                  this.__tryOrUnsub(this._next, value);
              }
              else if (this.__tryOrSetError(_parentSubscriber, this._next, value)) {
                  this.unsubscribe();
              }
          }
      };
      SafeSubscriber.prototype.error = function (err) {
          if (!this.isStopped) {
              var _parentSubscriber = this._parentSubscriber;
              var useDeprecatedSynchronousErrorHandling = config.useDeprecatedSynchronousErrorHandling;
              if (this._error) {
                  if (!useDeprecatedSynchronousErrorHandling || !_parentSubscriber.syncErrorThrowable) {
                      this.__tryOrUnsub(this._error, err);
                      this.unsubscribe();
                  }
                  else {
                      this.__tryOrSetError(_parentSubscriber, this._error, err);
                      this.unsubscribe();
                  }
              }
              else if (!_parentSubscriber.syncErrorThrowable) {
                  this.unsubscribe();
                  if (useDeprecatedSynchronousErrorHandling) {
                      throw err;
                  }
                  hostReportError(err);
              }
              else {
                  if (useDeprecatedSynchronousErrorHandling) {
                      _parentSubscriber.syncErrorValue = err;
                      _parentSubscriber.syncErrorThrown = true;
                  }
                  else {
                      hostReportError(err);
                  }
                  this.unsubscribe();
              }
          }
      };
      SafeSubscriber.prototype.complete = function () {
          var _this = this;
          if (!this.isStopped) {
              var _parentSubscriber = this._parentSubscriber;
              if (this._complete) {
                  var wrappedComplete = function () { return _this._complete.call(_this._context); };
                  if (!config.useDeprecatedSynchronousErrorHandling || !_parentSubscriber.syncErrorThrowable) {
                      this.__tryOrUnsub(wrappedComplete);
                      this.unsubscribe();
                  }
                  else {
                      this.__tryOrSetError(_parentSubscriber, wrappedComplete);
                      this.unsubscribe();
                  }
              }
              else {
                  this.unsubscribe();
              }
          }
      };
      SafeSubscriber.prototype.__tryOrUnsub = function (fn, value) {
          try {
              fn.call(this._context, value);
          }
          catch (err) {
              this.unsubscribe();
              if (config.useDeprecatedSynchronousErrorHandling) {
                  throw err;
              }
              else {
                  hostReportError(err);
              }
          }
      };
      SafeSubscriber.prototype.__tryOrSetError = function (parent, fn, value) {
          if (!config.useDeprecatedSynchronousErrorHandling) {
              throw new Error('bad call');
          }
          try {
              fn.call(this._context, value);
          }
          catch (err) {
              if (config.useDeprecatedSynchronousErrorHandling) {
                  parent.syncErrorValue = err;
                  parent.syncErrorThrown = true;
                  return true;
              }
              else {
                  hostReportError(err);
                  return true;
              }
          }
          return false;
      };
      SafeSubscriber.prototype._unsubscribe = function () {
          var _parentSubscriber = this._parentSubscriber;
          this._context = null;
          this._parentSubscriber = null;
          _parentSubscriber.unsubscribe();
      };
      return SafeSubscriber;
  }(Subscriber));
  //# sourceMappingURL=Subscriber.js.map

  /** PURE_IMPORTS_START _Subscriber PURE_IMPORTS_END */
  function canReportError(observer) {
      while (observer) {
          var _a = observer, closed_1 = _a.closed, destination = _a.destination, isStopped = _a.isStopped;
          if (closed_1 || isStopped) {
              return false;
          }
          else if (destination && destination instanceof Subscriber) {
              observer = destination;
          }
          else {
              observer = null;
          }
      }
      return true;
  }
  //# sourceMappingURL=canReportError.js.map

  /** PURE_IMPORTS_START _Subscriber,_symbol_rxSubscriber,_Observer PURE_IMPORTS_END */
  function toSubscriber(nextOrObserver, error, complete) {
      if (nextOrObserver) {
          if (nextOrObserver instanceof Subscriber) {
              return nextOrObserver;
          }
          if (nextOrObserver[rxSubscriber]) {
              return nextOrObserver[rxSubscriber]();
          }
      }
      if (!nextOrObserver && !error && !complete) {
          return new Subscriber(empty);
      }
      return new Subscriber(nextOrObserver, error, complete);
  }
  //# sourceMappingURL=toSubscriber.js.map

  /** PURE_IMPORTS_START  PURE_IMPORTS_END */
  var observable = typeof Symbol === 'function' && Symbol.observable || '@@observable';
  //# sourceMappingURL=observable.js.map

  /** PURE_IMPORTS_START  PURE_IMPORTS_END */
  function noop() { }
  //# sourceMappingURL=noop.js.map

  /** PURE_IMPORTS_START _noop PURE_IMPORTS_END */
  function pipeFromArray(fns) {
      if (!fns) {
          return noop;
      }
      if (fns.length === 1) {
          return fns[0];
      }
      return function piped(input) {
          return fns.reduce(function (prev, fn) { return fn(prev); }, input);
      };
  }
  //# sourceMappingURL=pipe.js.map

  /** PURE_IMPORTS_START _util_canReportError,_util_toSubscriber,_symbol_observable,_util_pipe,_config PURE_IMPORTS_END */
  var Observable = /*@__PURE__*/ (function () {
      function Observable(subscribe) {
          this._isScalar = false;
          if (subscribe) {
              this._subscribe = subscribe;
          }
      }
      Observable.prototype.lift = function (operator) {
          var observable = new Observable();
          observable.source = this;
          observable.operator = operator;
          return observable;
      };
      Observable.prototype.subscribe = function (observerOrNext, error, complete) {
          var operator = this.operator;
          var sink = toSubscriber(observerOrNext, error, complete);
          if (operator) {
              sink.add(operator.call(sink, this.source));
          }
          else {
              sink.add(this.source || (config.useDeprecatedSynchronousErrorHandling && !sink.syncErrorThrowable) ?
                  this._subscribe(sink) :
                  this._trySubscribe(sink));
          }
          if (config.useDeprecatedSynchronousErrorHandling) {
              if (sink.syncErrorThrowable) {
                  sink.syncErrorThrowable = false;
                  if (sink.syncErrorThrown) {
                      throw sink.syncErrorValue;
                  }
              }
          }
          return sink;
      };
      Observable.prototype._trySubscribe = function (sink) {
          try {
              return this._subscribe(sink);
          }
          catch (err) {
              if (config.useDeprecatedSynchronousErrorHandling) {
                  sink.syncErrorThrown = true;
                  sink.syncErrorValue = err;
              }
              if (canReportError(sink)) {
                  sink.error(err);
              }
              else {
                  console.warn(err);
              }
          }
      };
      Observable.prototype.forEach = function (next, promiseCtor) {
          var _this = this;
          promiseCtor = getPromiseCtor(promiseCtor);
          return new promiseCtor(function (resolve, reject) {
              var subscription;
              subscription = _this.subscribe(function (value) {
                  try {
                      next(value);
                  }
                  catch (err) {
                      reject(err);
                      if (subscription) {
                          subscription.unsubscribe();
                      }
                  }
              }, reject, resolve);
          });
      };
      Observable.prototype._subscribe = function (subscriber) {
          var source = this.source;
          return source && source.subscribe(subscriber);
      };
      Observable.prototype[observable] = function () {
          return this;
      };
      Observable.prototype.pipe = function () {
          var operations = [];
          for (var _i = 0; _i < arguments.length; _i++) {
              operations[_i] = arguments[_i];
          }
          if (operations.length === 0) {
              return this;
          }
          return pipeFromArray(operations)(this);
      };
      Observable.prototype.toPromise = function (promiseCtor) {
          var _this = this;
          promiseCtor = getPromiseCtor(promiseCtor);
          return new promiseCtor(function (resolve, reject) {
              var value;
              _this.subscribe(function (x) { return value = x; }, function (err) { return reject(err); }, function () { return resolve(value); });
          });
      };
      Observable.create = function (subscribe) {
          return new Observable(subscribe);
      };
      return Observable;
  }());
  function getPromiseCtor(promiseCtor) {
      if (!promiseCtor) {
          promiseCtor = Promise;
      }
      if (!promiseCtor) {
          throw new Error('no Promise impl found');
      }
      return promiseCtor;
  }
  //# sourceMappingURL=Observable.js.map

  /** PURE_IMPORTS_START  PURE_IMPORTS_END */
  function ObjectUnsubscribedErrorImpl() {
      Error.call(this);
      this.message = 'object unsubscribed';
      this.name = 'ObjectUnsubscribedError';
      return this;
  }
  ObjectUnsubscribedErrorImpl.prototype = /*@__PURE__*/ Object.create(Error.prototype);
  var ObjectUnsubscribedError = ObjectUnsubscribedErrorImpl;
  //# sourceMappingURL=ObjectUnsubscribedError.js.map

  /** PURE_IMPORTS_START tslib,_Subscription PURE_IMPORTS_END */
  var SubjectSubscription = /*@__PURE__*/ (function (_super) {
      __extends(SubjectSubscription, _super);
      function SubjectSubscription(subject, subscriber) {
          var _this = _super.call(this) || this;
          _this.subject = subject;
          _this.subscriber = subscriber;
          _this.closed = false;
          return _this;
      }
      SubjectSubscription.prototype.unsubscribe = function () {
          if (this.closed) {
              return;
          }
          this.closed = true;
          var subject = this.subject;
          var observers = subject.observers;
          this.subject = null;
          if (!observers || observers.length === 0 || subject.isStopped || subject.closed) {
              return;
          }
          var subscriberIndex = observers.indexOf(this.subscriber);
          if (subscriberIndex !== -1) {
              observers.splice(subscriberIndex, 1);
          }
      };
      return SubjectSubscription;
  }(Subscription));
  //# sourceMappingURL=SubjectSubscription.js.map

  /** PURE_IMPORTS_START tslib,_Observable,_Subscriber,_Subscription,_util_ObjectUnsubscribedError,_SubjectSubscription,_internal_symbol_rxSubscriber PURE_IMPORTS_END */
  var SubjectSubscriber = /*@__PURE__*/ (function (_super) {
      __extends(SubjectSubscriber, _super);
      function SubjectSubscriber(destination) {
          var _this = _super.call(this, destination) || this;
          _this.destination = destination;
          return _this;
      }
      return SubjectSubscriber;
  }(Subscriber));
  var Subject = /*@__PURE__*/ (function (_super) {
      __extends(Subject, _super);
      function Subject() {
          var _this = _super.call(this) || this;
          _this.observers = [];
          _this.closed = false;
          _this.isStopped = false;
          _this.hasError = false;
          _this.thrownError = null;
          return _this;
      }
      Subject.prototype[rxSubscriber] = function () {
          return new SubjectSubscriber(this);
      };
      Subject.prototype.lift = function (operator) {
          var subject = new AnonymousSubject(this, this);
          subject.operator = operator;
          return subject;
      };
      Subject.prototype.next = function (value) {
          if (this.closed) {
              throw new ObjectUnsubscribedError();
          }
          if (!this.isStopped) {
              var observers = this.observers;
              var len = observers.length;
              var copy = observers.slice();
              for (var i = 0; i < len; i++) {
                  copy[i].next(value);
              }
          }
      };
      Subject.prototype.error = function (err) {
          if (this.closed) {
              throw new ObjectUnsubscribedError();
          }
          this.hasError = true;
          this.thrownError = err;
          this.isStopped = true;
          var observers = this.observers;
          var len = observers.length;
          var copy = observers.slice();
          for (var i = 0; i < len; i++) {
              copy[i].error(err);
          }
          this.observers.length = 0;
      };
      Subject.prototype.complete = function () {
          if (this.closed) {
              throw new ObjectUnsubscribedError();
          }
          this.isStopped = true;
          var observers = this.observers;
          var len = observers.length;
          var copy = observers.slice();
          for (var i = 0; i < len; i++) {
              copy[i].complete();
          }
          this.observers.length = 0;
      };
      Subject.prototype.unsubscribe = function () {
          this.isStopped = true;
          this.closed = true;
          this.observers = null;
      };
      Subject.prototype._trySubscribe = function (subscriber) {
          if (this.closed) {
              throw new ObjectUnsubscribedError();
          }
          else {
              return _super.prototype._trySubscribe.call(this, subscriber);
          }
      };
      Subject.prototype._subscribe = function (subscriber) {
          if (this.closed) {
              throw new ObjectUnsubscribedError();
          }
          else if (this.hasError) {
              subscriber.error(this.thrownError);
              return Subscription.EMPTY;
          }
          else if (this.isStopped) {
              subscriber.complete();
              return Subscription.EMPTY;
          }
          else {
              this.observers.push(subscriber);
              return new SubjectSubscription(this, subscriber);
          }
      };
      Subject.prototype.asObservable = function () {
          var observable = new Observable();
          observable.source = this;
          return observable;
      };
      Subject.create = function (destination, source) {
          return new AnonymousSubject(destination, source);
      };
      return Subject;
  }(Observable));
  var AnonymousSubject = /*@__PURE__*/ (function (_super) {
      __extends(AnonymousSubject, _super);
      function AnonymousSubject(destination, source) {
          var _this = _super.call(this) || this;
          _this.destination = destination;
          _this.source = source;
          return _this;
      }
      AnonymousSubject.prototype.next = function (value) {
          var destination = this.destination;
          if (destination && destination.next) {
              destination.next(value);
          }
      };
      AnonymousSubject.prototype.error = function (err) {
          var destination = this.destination;
          if (destination && destination.error) {
              this.destination.error(err);
          }
      };
      AnonymousSubject.prototype.complete = function () {
          var destination = this.destination;
          if (destination && destination.complete) {
              this.destination.complete();
          }
      };
      AnonymousSubject.prototype._subscribe = function (subscriber) {
          var source = this.source;
          if (source) {
              return this.source.subscribe(subscriber);
          }
          else {
              return Subscription.EMPTY;
          }
      };
      return AnonymousSubject;
  }(Subject));
  //# sourceMappingURL=Subject.js.map

  /** PURE_IMPORTS_START tslib,_Subscriber PURE_IMPORTS_END */
  function refCount() {
      return function refCountOperatorFunction(source) {
          return source.lift(new RefCountOperator(source));
      };
  }
  var RefCountOperator = /*@__PURE__*/ (function () {
      function RefCountOperator(connectable) {
          this.connectable = connectable;
      }
      RefCountOperator.prototype.call = function (subscriber, source) {
          var connectable = this.connectable;
          connectable._refCount++;
          var refCounter = new RefCountSubscriber(subscriber, connectable);
          var subscription = source.subscribe(refCounter);
          if (!refCounter.closed) {
              refCounter.connection = connectable.connect();
          }
          return subscription;
      };
      return RefCountOperator;
  }());
  var RefCountSubscriber = /*@__PURE__*/ (function (_super) {
      __extends(RefCountSubscriber, _super);
      function RefCountSubscriber(destination, connectable) {
          var _this = _super.call(this, destination) || this;
          _this.connectable = connectable;
          return _this;
      }
      RefCountSubscriber.prototype._unsubscribe = function () {
          var connectable = this.connectable;
          if (!connectable) {
              this.connection = null;
              return;
          }
          this.connectable = null;
          var refCount = connectable._refCount;
          if (refCount <= 0) {
              this.connection = null;
              return;
          }
          connectable._refCount = refCount - 1;
          if (refCount > 1) {
              this.connection = null;
              return;
          }
          var connection = this.connection;
          var sharedConnection = connectable._connection;
          this.connection = null;
          if (sharedConnection && (!connection || sharedConnection === connection)) {
              sharedConnection.unsubscribe();
          }
      };
      return RefCountSubscriber;
  }(Subscriber));
  //# sourceMappingURL=refCount.js.map

  /** PURE_IMPORTS_START tslib,_Subject,_Observable,_Subscriber,_Subscription,_operators_refCount PURE_IMPORTS_END */
  var ConnectableObservable = /*@__PURE__*/ (function (_super) {
      __extends(ConnectableObservable, _super);
      function ConnectableObservable(source, subjectFactory) {
          var _this = _super.call(this) || this;
          _this.source = source;
          _this.subjectFactory = subjectFactory;
          _this._refCount = 0;
          _this._isComplete = false;
          return _this;
      }
      ConnectableObservable.prototype._subscribe = function (subscriber) {
          return this.getSubject().subscribe(subscriber);
      };
      ConnectableObservable.prototype.getSubject = function () {
          var subject = this._subject;
          if (!subject || subject.isStopped) {
              this._subject = this.subjectFactory();
          }
          return this._subject;
      };
      ConnectableObservable.prototype.connect = function () {
          var connection = this._connection;
          if (!connection) {
              this._isComplete = false;
              connection = this._connection = new Subscription();
              connection.add(this.source
                  .subscribe(new ConnectableSubscriber(this.getSubject(), this)));
              if (connection.closed) {
                  this._connection = null;
                  connection = Subscription.EMPTY;
              }
          }
          return connection;
      };
      ConnectableObservable.prototype.refCount = function () {
          return refCount()(this);
      };
      return ConnectableObservable;
  }(Observable));
  var connectableProto = ConnectableObservable.prototype;
  var connectableObservableDescriptor = {
      operator: { value: null },
      _refCount: { value: 0, writable: true },
      _subject: { value: null, writable: true },
      _connection: { value: null, writable: true },
      _subscribe: { value: connectableProto._subscribe },
      _isComplete: { value: connectableProto._isComplete, writable: true },
      getSubject: { value: connectableProto.getSubject },
      connect: { value: connectableProto.connect },
      refCount: { value: connectableProto.refCount }
  };
  var ConnectableSubscriber = /*@__PURE__*/ (function (_super) {
      __extends(ConnectableSubscriber, _super);
      function ConnectableSubscriber(destination, connectable) {
          var _this = _super.call(this, destination) || this;
          _this.connectable = connectable;
          return _this;
      }
      ConnectableSubscriber.prototype._error = function (err) {
          this._unsubscribe();
          _super.prototype._error.call(this, err);
      };
      ConnectableSubscriber.prototype._complete = function () {
          this.connectable._isComplete = true;
          this._unsubscribe();
          _super.prototype._complete.call(this);
      };
      ConnectableSubscriber.prototype._unsubscribe = function () {
          var connectable = this.connectable;
          if (connectable) {
              this.connectable = null;
              var connection = connectable._connection;
              connectable._refCount = 0;
              connectable._subject = null;
              connectable._connection = null;
              if (connection) {
                  connection.unsubscribe();
              }
          }
      };
      return ConnectableSubscriber;
  }(SubjectSubscriber));
  //# sourceMappingURL=ConnectableObservable.js.map

  /** PURE_IMPORTS_START tslib,_Subscriber,_Subscription,_Observable,_Subject PURE_IMPORTS_END */
  //# sourceMappingURL=groupBy.js.map

  /** PURE_IMPORTS_START tslib,_Subject,_util_ObjectUnsubscribedError PURE_IMPORTS_END */
  var BehaviorSubject = /*@__PURE__*/ (function (_super) {
      __extends(BehaviorSubject, _super);
      function BehaviorSubject(_value) {
          var _this = _super.call(this) || this;
          _this._value = _value;
          return _this;
      }
      Object.defineProperty(BehaviorSubject.prototype, "value", {
          get: function () {
              return this.getValue();
          },
          enumerable: true,
          configurable: true
      });
      BehaviorSubject.prototype._subscribe = function (subscriber) {
          var subscription = _super.prototype._subscribe.call(this, subscriber);
          if (subscription && !subscription.closed) {
              subscriber.next(this._value);
          }
          return subscription;
      };
      BehaviorSubject.prototype.getValue = function () {
          if (this.hasError) {
              throw this.thrownError;
          }
          else if (this.closed) {
              throw new ObjectUnsubscribedError();
          }
          else {
              return this._value;
          }
      };
      BehaviorSubject.prototype.next = function (value) {
          _super.prototype.next.call(this, this._value = value);
      };
      return BehaviorSubject;
  }(Subject));
  //# sourceMappingURL=BehaviorSubject.js.map

  /** PURE_IMPORTS_START tslib,_Subscription PURE_IMPORTS_END */
  //# sourceMappingURL=Action.js.map

  /** PURE_IMPORTS_START tslib,_Action PURE_IMPORTS_END */
  //# sourceMappingURL=AsyncAction.js.map

  /** PURE_IMPORTS_START tslib,_AsyncAction PURE_IMPORTS_END */
  //# sourceMappingURL=QueueAction.js.map

  //# sourceMappingURL=Scheduler.js.map

  /** PURE_IMPORTS_START tslib,_Scheduler PURE_IMPORTS_END */
  //# sourceMappingURL=AsyncScheduler.js.map

  /** PURE_IMPORTS_START tslib,_AsyncScheduler PURE_IMPORTS_END */
  //# sourceMappingURL=QueueScheduler.js.map

  /** PURE_IMPORTS_START _QueueAction,_QueueScheduler PURE_IMPORTS_END */
  //# sourceMappingURL=queue.js.map

  /** PURE_IMPORTS_START _Observable PURE_IMPORTS_END */
  //# sourceMappingURL=empty.js.map

  /** PURE_IMPORTS_START  PURE_IMPORTS_END */
  //# sourceMappingURL=isScheduler.js.map

  /** PURE_IMPORTS_START  PURE_IMPORTS_END */
  //# sourceMappingURL=subscribeToArray.js.map

  /** PURE_IMPORTS_START _Observable,_Subscription PURE_IMPORTS_END */
  //# sourceMappingURL=scheduleArray.js.map

  /** PURE_IMPORTS_START _Observable,_util_subscribeToArray,_scheduled_scheduleArray PURE_IMPORTS_END */
  //# sourceMappingURL=fromArray.js.map

  /** PURE_IMPORTS_START _util_isScheduler,_fromArray,_scheduled_scheduleArray PURE_IMPORTS_END */
  //# sourceMappingURL=of.js.map

  /** PURE_IMPORTS_START _Observable PURE_IMPORTS_END */
  //# sourceMappingURL=throwError.js.map

  /** PURE_IMPORTS_START _observable_empty,_observable_of,_observable_throwError PURE_IMPORTS_END */
  //# sourceMappingURL=Notification.js.map

  /** PURE_IMPORTS_START tslib,_Subscriber,_Notification PURE_IMPORTS_END */
  //# sourceMappingURL=observeOn.js.map

  /** PURE_IMPORTS_START tslib,_Subject,_scheduler_queue,_Subscription,_operators_observeOn,_util_ObjectUnsubscribedError,_SubjectSubscription PURE_IMPORTS_END */
  //# sourceMappingURL=ReplaySubject.js.map

  /** PURE_IMPORTS_START tslib,_Subject,_Subscription PURE_IMPORTS_END */
  //# sourceMappingURL=AsyncSubject.js.map

  /** PURE_IMPORTS_START  PURE_IMPORTS_END */
  //# sourceMappingURL=Immediate.js.map

  /** PURE_IMPORTS_START tslib,_util_Immediate,_AsyncAction PURE_IMPORTS_END */
  //# sourceMappingURL=AsapAction.js.map

  /** PURE_IMPORTS_START tslib,_AsyncScheduler PURE_IMPORTS_END */
  //# sourceMappingURL=AsapScheduler.js.map

  /** PURE_IMPORTS_START _AsapAction,_AsapScheduler PURE_IMPORTS_END */
  //# sourceMappingURL=asap.js.map

  /** PURE_IMPORTS_START _AsyncAction,_AsyncScheduler PURE_IMPORTS_END */
  //# sourceMappingURL=async.js.map

  /** PURE_IMPORTS_START tslib,_AsyncAction PURE_IMPORTS_END */
  //# sourceMappingURL=AnimationFrameAction.js.map

  /** PURE_IMPORTS_START tslib,_AsyncScheduler PURE_IMPORTS_END */
  //# sourceMappingURL=AnimationFrameScheduler.js.map

  /** PURE_IMPORTS_START _AnimationFrameAction,_AnimationFrameScheduler PURE_IMPORTS_END */
  //# sourceMappingURL=animationFrame.js.map

  /** PURE_IMPORTS_START tslib,_AsyncAction,_AsyncScheduler PURE_IMPORTS_END */
  //# sourceMappingURL=VirtualTimeScheduler.js.map

  /** PURE_IMPORTS_START  PURE_IMPORTS_END */
  //# sourceMappingURL=identity.js.map

  /** PURE_IMPORTS_START _Observable PURE_IMPORTS_END */
  //# sourceMappingURL=isObservable.js.map

  /** PURE_IMPORTS_START  PURE_IMPORTS_END */
  //# sourceMappingURL=ArgumentOutOfRangeError.js.map

  /** PURE_IMPORTS_START  PURE_IMPORTS_END */
  //# sourceMappingURL=EmptyError.js.map

  /** PURE_IMPORTS_START  PURE_IMPORTS_END */
  //# sourceMappingURL=TimeoutError.js.map

  /** PURE_IMPORTS_START tslib,_Subscriber PURE_IMPORTS_END */
  //# sourceMappingURL=map.js.map

  /** PURE_IMPORTS_START _Observable,_AsyncSubject,_operators_map,_util_canReportError,_util_isArray,_util_isScheduler PURE_IMPORTS_END */
  //# sourceMappingURL=bindCallback.js.map

  /** PURE_IMPORTS_START _Observable,_AsyncSubject,_operators_map,_util_canReportError,_util_isScheduler,_util_isArray PURE_IMPORTS_END */
  //# sourceMappingURL=bindNodeCallback.js.map

  /** PURE_IMPORTS_START tslib,_Subscriber PURE_IMPORTS_END */
  //# sourceMappingURL=OuterSubscriber.js.map

  /** PURE_IMPORTS_START tslib,_Subscriber PURE_IMPORTS_END */
  //# sourceMappingURL=InnerSubscriber.js.map

  /** PURE_IMPORTS_START _hostReportError PURE_IMPORTS_END */
  //# sourceMappingURL=subscribeToPromise.js.map

  /** PURE_IMPORTS_START  PURE_IMPORTS_END */
  //# sourceMappingURL=iterator.js.map

  /** PURE_IMPORTS_START _symbol_iterator PURE_IMPORTS_END */
  //# sourceMappingURL=subscribeToIterable.js.map

  /** PURE_IMPORTS_START _symbol_observable PURE_IMPORTS_END */
  //# sourceMappingURL=subscribeToObservable.js.map

  /** PURE_IMPORTS_START  PURE_IMPORTS_END */
  //# sourceMappingURL=isArrayLike.js.map

  /** PURE_IMPORTS_START  PURE_IMPORTS_END */
  //# sourceMappingURL=isPromise.js.map

  /** PURE_IMPORTS_START _subscribeToArray,_subscribeToPromise,_subscribeToIterable,_subscribeToObservable,_isArrayLike,_isPromise,_isObject,_symbol_iterator,_symbol_observable PURE_IMPORTS_END */
  //# sourceMappingURL=subscribeTo.js.map

  /** PURE_IMPORTS_START _InnerSubscriber,_subscribeTo,_Observable PURE_IMPORTS_END */
  //# sourceMappingURL=subscribeToResult.js.map

  /** PURE_IMPORTS_START tslib,_util_isScheduler,_util_isArray,_OuterSubscriber,_util_subscribeToResult,_fromArray PURE_IMPORTS_END */
  //# sourceMappingURL=combineLatest.js.map

  /** PURE_IMPORTS_START _Observable,_Subscription,_symbol_observable PURE_IMPORTS_END */
  //# sourceMappingURL=scheduleObservable.js.map

  /** PURE_IMPORTS_START _Observable,_Subscription PURE_IMPORTS_END */
  //# sourceMappingURL=schedulePromise.js.map

  /** PURE_IMPORTS_START _Observable,_Subscription,_symbol_iterator PURE_IMPORTS_END */
  //# sourceMappingURL=scheduleIterable.js.map

  /** PURE_IMPORTS_START _symbol_observable PURE_IMPORTS_END */
  //# sourceMappingURL=isInteropObservable.js.map

  /** PURE_IMPORTS_START _symbol_iterator PURE_IMPORTS_END */
  //# sourceMappingURL=isIterable.js.map

  /** PURE_IMPORTS_START _scheduleObservable,_schedulePromise,_scheduleArray,_scheduleIterable,_util_isInteropObservable,_util_isPromise,_util_isArrayLike,_util_isIterable PURE_IMPORTS_END */
  //# sourceMappingURL=scheduled.js.map

  /** PURE_IMPORTS_START _Observable,_util_subscribeTo,_scheduled_scheduled PURE_IMPORTS_END */
  //# sourceMappingURL=from.js.map

  /** PURE_IMPORTS_START tslib,_util_subscribeToResult,_OuterSubscriber,_InnerSubscriber,_map,_observable_from PURE_IMPORTS_END */
  //# sourceMappingURL=mergeMap.js.map

  /** PURE_IMPORTS_START _mergeMap,_util_identity PURE_IMPORTS_END */
  //# sourceMappingURL=mergeAll.js.map

  /** PURE_IMPORTS_START _mergeAll PURE_IMPORTS_END */
  //# sourceMappingURL=concatAll.js.map

  /** PURE_IMPORTS_START _of,_operators_concatAll PURE_IMPORTS_END */
  //# sourceMappingURL=concat.js.map

  /** PURE_IMPORTS_START _Observable,_from,_empty PURE_IMPORTS_END */
  //# sourceMappingURL=defer.js.map

  /** PURE_IMPORTS_START _Observable,_util_isArray,_operators_map,_util_isObject,_util_isObservable,_from PURE_IMPORTS_END */
  //# sourceMappingURL=forkJoin.js.map

  /** PURE_IMPORTS_START _Observable,_util_isArray,_util_isFunction,_operators_map PURE_IMPORTS_END */
  //# sourceMappingURL=fromEvent.js.map

  /** PURE_IMPORTS_START _Observable,_util_isArray,_util_isFunction,_operators_map PURE_IMPORTS_END */
  //# sourceMappingURL=fromEventPattern.js.map

  /** PURE_IMPORTS_START _Observable,_util_identity,_util_isScheduler PURE_IMPORTS_END */
  //# sourceMappingURL=generate.js.map

  /** PURE_IMPORTS_START _defer,_empty PURE_IMPORTS_END */
  //# sourceMappingURL=iif.js.map

  /** PURE_IMPORTS_START _isArray PURE_IMPORTS_END */
  //# sourceMappingURL=isNumeric.js.map

  /** PURE_IMPORTS_START _Observable,_scheduler_async,_util_isNumeric PURE_IMPORTS_END */
  //# sourceMappingURL=interval.js.map

  /** PURE_IMPORTS_START _Observable,_util_isScheduler,_operators_mergeAll,_fromArray PURE_IMPORTS_END */
  //# sourceMappingURL=merge.js.map

  /** PURE_IMPORTS_START _Observable,_util_noop PURE_IMPORTS_END */
  //# sourceMappingURL=never.js.map

  /** PURE_IMPORTS_START _Observable,_from,_util_isArray,_empty PURE_IMPORTS_END */
  //# sourceMappingURL=onErrorResumeNext.js.map

  /** PURE_IMPORTS_START _Observable,_Subscription PURE_IMPORTS_END */
  //# sourceMappingURL=pairs.js.map

  /** PURE_IMPORTS_START  PURE_IMPORTS_END */
  //# sourceMappingURL=not.js.map

  /** PURE_IMPORTS_START tslib,_Subscriber PURE_IMPORTS_END */
  //# sourceMappingURL=filter.js.map

  /** PURE_IMPORTS_START _util_not,_util_subscribeTo,_operators_filter,_Observable PURE_IMPORTS_END */
  //# sourceMappingURL=partition.js.map

  /** PURE_IMPORTS_START tslib,_util_isArray,_fromArray,_OuterSubscriber,_util_subscribeToResult PURE_IMPORTS_END */
  //# sourceMappingURL=race.js.map

  /** PURE_IMPORTS_START _Observable PURE_IMPORTS_END */
  //# sourceMappingURL=range.js.map

  /** PURE_IMPORTS_START _Observable,_scheduler_async,_util_isNumeric,_util_isScheduler PURE_IMPORTS_END */
  //# sourceMappingURL=timer.js.map

  /** PURE_IMPORTS_START _Observable,_from,_empty PURE_IMPORTS_END */
  //# sourceMappingURL=using.js.map

  /** PURE_IMPORTS_START tslib,_fromArray,_util_isArray,_Subscriber,_OuterSubscriber,_util_subscribeToResult,_.._internal_symbol_iterator PURE_IMPORTS_END */
  //# sourceMappingURL=zip.js.map

  /** PURE_IMPORTS_START  PURE_IMPORTS_END */
  //# sourceMappingURL=index.js.map

  /**
   * Removes all key-value entries from the list cache.
   *
   * @private
   * @name clear
   * @memberOf ListCache
   */
  function listCacheClear() {
    this.__data__ = [];
    this.size = 0;
  }

  var _listCacheClear = listCacheClear;

  /**
   * Performs a
   * [`SameValueZero`](http://ecma-international.org/ecma-262/7.0/#sec-samevaluezero)
   * comparison between two values to determine if they are equivalent.
   *
   * @static
   * @memberOf _
   * @since 4.0.0
   * @category Lang
   * @param {*} value The value to compare.
   * @param {*} other The other value to compare.
   * @returns {boolean} Returns `true` if the values are equivalent, else `false`.
   * @example
   *
   * var object = { 'a': 1 };
   * var other = { 'a': 1 };
   *
   * _.eq(object, object);
   * // => true
   *
   * _.eq(object, other);
   * // => false
   *
   * _.eq('a', 'a');
   * // => true
   *
   * _.eq('a', Object('a'));
   * // => false
   *
   * _.eq(NaN, NaN);
   * // => true
   */
  function eq(value, other) {
    return value === other || (value !== value && other !== other);
  }

  var eq_1 = eq;

  /**
   * Gets the index at which the `key` is found in `array` of key-value pairs.
   *
   * @private
   * @param {Array} array The array to inspect.
   * @param {*} key The key to search for.
   * @returns {number} Returns the index of the matched value, else `-1`.
   */
  function assocIndexOf(array, key) {
    var length = array.length;
    while (length--) {
      if (eq_1(array[length][0], key)) {
        return length;
      }
    }
    return -1;
  }

  var _assocIndexOf = assocIndexOf;

  /** Used for built-in method references. */
  var arrayProto = Array.prototype;

  /** Built-in value references. */
  var splice = arrayProto.splice;

  /**
   * Removes `key` and its value from the list cache.
   *
   * @private
   * @name delete
   * @memberOf ListCache
   * @param {string} key The key of the value to remove.
   * @returns {boolean} Returns `true` if the entry was removed, else `false`.
   */
  function listCacheDelete(key) {
    var data = this.__data__,
        index = _assocIndexOf(data, key);

    if (index < 0) {
      return false;
    }
    var lastIndex = data.length - 1;
    if (index == lastIndex) {
      data.pop();
    } else {
      splice.call(data, index, 1);
    }
    --this.size;
    return true;
  }

  var _listCacheDelete = listCacheDelete;

  /**
   * Gets the list cache value for `key`.
   *
   * @private
   * @name get
   * @memberOf ListCache
   * @param {string} key The key of the value to get.
   * @returns {*} Returns the entry value.
   */
  function listCacheGet(key) {
    var data = this.__data__,
        index = _assocIndexOf(data, key);

    return index < 0 ? undefined : data[index][1];
  }

  var _listCacheGet = listCacheGet;

  /**
   * Checks if a list cache value for `key` exists.
   *
   * @private
   * @name has
   * @memberOf ListCache
   * @param {string} key The key of the entry to check.
   * @returns {boolean} Returns `true` if an entry for `key` exists, else `false`.
   */
  function listCacheHas(key) {
    return _assocIndexOf(this.__data__, key) > -1;
  }

  var _listCacheHas = listCacheHas;

  /**
   * Sets the list cache `key` to `value`.
   *
   * @private
   * @name set
   * @memberOf ListCache
   * @param {string} key The key of the value to set.
   * @param {*} value The value to set.
   * @returns {Object} Returns the list cache instance.
   */
  function listCacheSet(key, value) {
    var data = this.__data__,
        index = _assocIndexOf(data, key);

    if (index < 0) {
      ++this.size;
      data.push([key, value]);
    } else {
      data[index][1] = value;
    }
    return this;
  }

  var _listCacheSet = listCacheSet;

  /**
   * Creates an list cache object.
   *
   * @private
   * @constructor
   * @param {Array} [entries] The key-value pairs to cache.
   */
  function ListCache(entries) {
    var index = -1,
        length = entries == null ? 0 : entries.length;

    this.clear();
    while (++index < length) {
      var entry = entries[index];
      this.set(entry[0], entry[1]);
    }
  }

  // Add methods to `ListCache`.
  ListCache.prototype.clear = _listCacheClear;
  ListCache.prototype['delete'] = _listCacheDelete;
  ListCache.prototype.get = _listCacheGet;
  ListCache.prototype.has = _listCacheHas;
  ListCache.prototype.set = _listCacheSet;

  var _ListCache = ListCache;

  /**
   * Removes all key-value entries from the stack.
   *
   * @private
   * @name clear
   * @memberOf Stack
   */
  function stackClear() {
    this.__data__ = new _ListCache;
    this.size = 0;
  }

  var _stackClear = stackClear;

  /**
   * Removes `key` and its value from the stack.
   *
   * @private
   * @name delete
   * @memberOf Stack
   * @param {string} key The key of the value to remove.
   * @returns {boolean} Returns `true` if the entry was removed, else `false`.
   */
  function stackDelete(key) {
    var data = this.__data__,
        result = data['delete'](key);

    this.size = data.size;
    return result;
  }

  var _stackDelete = stackDelete;

  /**
   * Gets the stack value for `key`.
   *
   * @private
   * @name get
   * @memberOf Stack
   * @param {string} key The key of the value to get.
   * @returns {*} Returns the entry value.
   */
  function stackGet(key) {
    return this.__data__.get(key);
  }

  var _stackGet = stackGet;

  /**
   * Checks if a stack value for `key` exists.
   *
   * @private
   * @name has
   * @memberOf Stack
   * @param {string} key The key of the entry to check.
   * @returns {boolean} Returns `true` if an entry for `key` exists, else `false`.
   */
  function stackHas(key) {
    return this.__data__.has(key);
  }

  var _stackHas = stackHas;

  var commonjsGlobal = typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : typeof self !== 'undefined' ? self : {};

  function createCommonjsModule(fn, module) {
  	return module = { exports: {} }, fn(module, module.exports), module.exports;
  }

  /** Detect free variable `global` from Node.js. */
  var freeGlobal = typeof commonjsGlobal == 'object' && commonjsGlobal && commonjsGlobal.Object === Object && commonjsGlobal;

  var _freeGlobal = freeGlobal;

  /** Detect free variable `self`. */
  var freeSelf = typeof self == 'object' && self && self.Object === Object && self;

  /** Used as a reference to the global object. */
  var root$1 = _freeGlobal || freeSelf || Function('return this')();

  var _root = root$1;

  /** Built-in value references. */
  var Symbol$1 = _root.Symbol;

  var _Symbol = Symbol$1;

  /** Used for built-in method references. */
  var objectProto = Object.prototype;

  /** Used to check objects for own properties. */
  var hasOwnProperty = objectProto.hasOwnProperty;

  /**
   * Used to resolve the
   * [`toStringTag`](http://ecma-international.org/ecma-262/7.0/#sec-object.prototype.tostring)
   * of values.
   */
  var nativeObjectToString = objectProto.toString;

  /** Built-in value references. */
  var symToStringTag = _Symbol ? _Symbol.toStringTag : undefined;

  /**
   * A specialized version of `baseGetTag` which ignores `Symbol.toStringTag` values.
   *
   * @private
   * @param {*} value The value to query.
   * @returns {string} Returns the raw `toStringTag`.
   */
  function getRawTag(value) {
    var isOwn = hasOwnProperty.call(value, symToStringTag),
        tag = value[symToStringTag];

    try {
      value[symToStringTag] = undefined;
      var unmasked = true;
    } catch (e) {}

    var result = nativeObjectToString.call(value);
    if (unmasked) {
      if (isOwn) {
        value[symToStringTag] = tag;
      } else {
        delete value[symToStringTag];
      }
    }
    return result;
  }

  var _getRawTag = getRawTag;

  /** Used for built-in method references. */
  var objectProto$1 = Object.prototype;

  /**
   * Used to resolve the
   * [`toStringTag`](http://ecma-international.org/ecma-262/7.0/#sec-object.prototype.tostring)
   * of values.
   */
  var nativeObjectToString$1 = objectProto$1.toString;

  /**
   * Converts `value` to a string using `Object.prototype.toString`.
   *
   * @private
   * @param {*} value The value to convert.
   * @returns {string} Returns the converted string.
   */
  function objectToString(value) {
    return nativeObjectToString$1.call(value);
  }

  var _objectToString = objectToString;

  /** `Object#toString` result references. */
  var nullTag = '[object Null]',
      undefinedTag = '[object Undefined]';

  /** Built-in value references. */
  var symToStringTag$1 = _Symbol ? _Symbol.toStringTag : undefined;

  /**
   * The base implementation of `getTag` without fallbacks for buggy environments.
   *
   * @private
   * @param {*} value The value to query.
   * @returns {string} Returns the `toStringTag`.
   */
  function baseGetTag(value) {
    if (value == null) {
      return value === undefined ? undefinedTag : nullTag;
    }
    return (symToStringTag$1 && symToStringTag$1 in Object(value))
      ? _getRawTag(value)
      : _objectToString(value);
  }

  var _baseGetTag = baseGetTag;

  /**
   * Checks if `value` is the
   * [language type](http://www.ecma-international.org/ecma-262/7.0/#sec-ecmascript-language-types)
   * of `Object`. (e.g. arrays, functions, objects, regexes, `new Number(0)`, and `new String('')`)
   *
   * @static
   * @memberOf _
   * @since 0.1.0
   * @category Lang
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is an object, else `false`.
   * @example
   *
   * _.isObject({});
   * // => true
   *
   * _.isObject([1, 2, 3]);
   * // => true
   *
   * _.isObject(_.noop);
   * // => true
   *
   * _.isObject(null);
   * // => false
   */
  function isObject$1(value) {
    var type = typeof value;
    return value != null && (type == 'object' || type == 'function');
  }

  var isObject_1 = isObject$1;

  /** `Object#toString` result references. */
  var asyncTag = '[object AsyncFunction]',
      funcTag = '[object Function]',
      genTag = '[object GeneratorFunction]',
      proxyTag = '[object Proxy]';

  /**
   * Checks if `value` is classified as a `Function` object.
   *
   * @static
   * @memberOf _
   * @since 0.1.0
   * @category Lang
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is a function, else `false`.
   * @example
   *
   * _.isFunction(_);
   * // => true
   *
   * _.isFunction(/abc/);
   * // => false
   */
  function isFunction$1(value) {
    if (!isObject_1(value)) {
      return false;
    }
    // The use of `Object#toString` avoids issues with the `typeof` operator
    // in Safari 9 which returns 'object' for typed arrays and other constructors.
    var tag = _baseGetTag(value);
    return tag == funcTag || tag == genTag || tag == asyncTag || tag == proxyTag;
  }

  var isFunction_1 = isFunction$1;

  /** Used to detect overreaching core-js shims. */
  var coreJsData = _root['__core-js_shared__'];

  var _coreJsData = coreJsData;

  /** Used to detect methods masquerading as native. */
  var maskSrcKey = (function() {
    var uid = /[^.]+$/.exec(_coreJsData && _coreJsData.keys && _coreJsData.keys.IE_PROTO || '');
    return uid ? ('Symbol(src)_1.' + uid) : '';
  }());

  /**
   * Checks if `func` has its source masked.
   *
   * @private
   * @param {Function} func The function to check.
   * @returns {boolean} Returns `true` if `func` is masked, else `false`.
   */
  function isMasked(func) {
    return !!maskSrcKey && (maskSrcKey in func);
  }

  var _isMasked = isMasked;

  /** Used for built-in method references. */
  var funcProto = Function.prototype;

  /** Used to resolve the decompiled source of functions. */
  var funcToString = funcProto.toString;

  /**
   * Converts `func` to its source code.
   *
   * @private
   * @param {Function} func The function to convert.
   * @returns {string} Returns the source code.
   */
  function toSource(func) {
    if (func != null) {
      try {
        return funcToString.call(func);
      } catch (e) {}
      try {
        return (func + '');
      } catch (e) {}
    }
    return '';
  }

  var _toSource = toSource;

  /**
   * Used to match `RegExp`
   * [syntax characters](http://ecma-international.org/ecma-262/7.0/#sec-patterns).
   */
  var reRegExpChar = /[\\^$.*+?()[\]{}|]/g;

  /** Used to detect host constructors (Safari). */
  var reIsHostCtor = /^\[object .+?Constructor\]$/;

  /** Used for built-in method references. */
  var funcProto$1 = Function.prototype,
      objectProto$2 = Object.prototype;

  /** Used to resolve the decompiled source of functions. */
  var funcToString$1 = funcProto$1.toString;

  /** Used to check objects for own properties. */
  var hasOwnProperty$1 = objectProto$2.hasOwnProperty;

  /** Used to detect if a method is native. */
  var reIsNative = RegExp('^' +
    funcToString$1.call(hasOwnProperty$1).replace(reRegExpChar, '\\$&')
    .replace(/hasOwnProperty|(function).*?(?=\\\()| for .+?(?=\\\])/g, '$1.*?') + '$'
  );

  /**
   * The base implementation of `_.isNative` without bad shim checks.
   *
   * @private
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is a native function,
   *  else `false`.
   */
  function baseIsNative(value) {
    if (!isObject_1(value) || _isMasked(value)) {
      return false;
    }
    var pattern = isFunction_1(value) ? reIsNative : reIsHostCtor;
    return pattern.test(_toSource(value));
  }

  var _baseIsNative = baseIsNative;

  /**
   * Gets the value at `key` of `object`.
   *
   * @private
   * @param {Object} [object] The object to query.
   * @param {string} key The key of the property to get.
   * @returns {*} Returns the property value.
   */
  function getValue(object, key) {
    return object == null ? undefined : object[key];
  }

  var _getValue = getValue;

  /**
   * Gets the native function at `key` of `object`.
   *
   * @private
   * @param {Object} object The object to query.
   * @param {string} key The key of the method to get.
   * @returns {*} Returns the function if it's native, else `undefined`.
   */
  function getNative(object, key) {
    var value = _getValue(object, key);
    return _baseIsNative(value) ? value : undefined;
  }

  var _getNative = getNative;

  /* Built-in method references that are verified to be native. */
  var Map$1 = _getNative(_root, 'Map');

  var _Map = Map$1;

  /* Built-in method references that are verified to be native. */
  var nativeCreate = _getNative(Object, 'create');

  var _nativeCreate = nativeCreate;

  /**
   * Removes all key-value entries from the hash.
   *
   * @private
   * @name clear
   * @memberOf Hash
   */
  function hashClear() {
    this.__data__ = _nativeCreate ? _nativeCreate(null) : {};
    this.size = 0;
  }

  var _hashClear = hashClear;

  /**
   * Removes `key` and its value from the hash.
   *
   * @private
   * @name delete
   * @memberOf Hash
   * @param {Object} hash The hash to modify.
   * @param {string} key The key of the value to remove.
   * @returns {boolean} Returns `true` if the entry was removed, else `false`.
   */
  function hashDelete(key) {
    var result = this.has(key) && delete this.__data__[key];
    this.size -= result ? 1 : 0;
    return result;
  }

  var _hashDelete = hashDelete;

  /** Used to stand-in for `undefined` hash values. */
  var HASH_UNDEFINED = '__lodash_hash_undefined__';

  /** Used for built-in method references. */
  var objectProto$3 = Object.prototype;

  /** Used to check objects for own properties. */
  var hasOwnProperty$2 = objectProto$3.hasOwnProperty;

  /**
   * Gets the hash value for `key`.
   *
   * @private
   * @name get
   * @memberOf Hash
   * @param {string} key The key of the value to get.
   * @returns {*} Returns the entry value.
   */
  function hashGet(key) {
    var data = this.__data__;
    if (_nativeCreate) {
      var result = data[key];
      return result === HASH_UNDEFINED ? undefined : result;
    }
    return hasOwnProperty$2.call(data, key) ? data[key] : undefined;
  }

  var _hashGet = hashGet;

  /** Used for built-in method references. */
  var objectProto$4 = Object.prototype;

  /** Used to check objects for own properties. */
  var hasOwnProperty$3 = objectProto$4.hasOwnProperty;

  /**
   * Checks if a hash value for `key` exists.
   *
   * @private
   * @name has
   * @memberOf Hash
   * @param {string} key The key of the entry to check.
   * @returns {boolean} Returns `true` if an entry for `key` exists, else `false`.
   */
  function hashHas(key) {
    var data = this.__data__;
    return _nativeCreate ? (data[key] !== undefined) : hasOwnProperty$3.call(data, key);
  }

  var _hashHas = hashHas;

  /** Used to stand-in for `undefined` hash values. */
  var HASH_UNDEFINED$1 = '__lodash_hash_undefined__';

  /**
   * Sets the hash `key` to `value`.
   *
   * @private
   * @name set
   * @memberOf Hash
   * @param {string} key The key of the value to set.
   * @param {*} value The value to set.
   * @returns {Object} Returns the hash instance.
   */
  function hashSet(key, value) {
    var data = this.__data__;
    this.size += this.has(key) ? 0 : 1;
    data[key] = (_nativeCreate && value === undefined) ? HASH_UNDEFINED$1 : value;
    return this;
  }

  var _hashSet = hashSet;

  /**
   * Creates a hash object.
   *
   * @private
   * @constructor
   * @param {Array} [entries] The key-value pairs to cache.
   */
  function Hash(entries) {
    var index = -1,
        length = entries == null ? 0 : entries.length;

    this.clear();
    while (++index < length) {
      var entry = entries[index];
      this.set(entry[0], entry[1]);
    }
  }

  // Add methods to `Hash`.
  Hash.prototype.clear = _hashClear;
  Hash.prototype['delete'] = _hashDelete;
  Hash.prototype.get = _hashGet;
  Hash.prototype.has = _hashHas;
  Hash.prototype.set = _hashSet;

  var _Hash = Hash;

  /**
   * Removes all key-value entries from the map.
   *
   * @private
   * @name clear
   * @memberOf MapCache
   */
  function mapCacheClear() {
    this.size = 0;
    this.__data__ = {
      'hash': new _Hash,
      'map': new (_Map || _ListCache),
      'string': new _Hash
    };
  }

  var _mapCacheClear = mapCacheClear;

  /**
   * Checks if `value` is suitable for use as unique object key.
   *
   * @private
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is suitable, else `false`.
   */
  function isKeyable(value) {
    var type = typeof value;
    return (type == 'string' || type == 'number' || type == 'symbol' || type == 'boolean')
      ? (value !== '__proto__')
      : (value === null);
  }

  var _isKeyable = isKeyable;

  /**
   * Gets the data for `map`.
   *
   * @private
   * @param {Object} map The map to query.
   * @param {string} key The reference key.
   * @returns {*} Returns the map data.
   */
  function getMapData(map, key) {
    var data = map.__data__;
    return _isKeyable(key)
      ? data[typeof key == 'string' ? 'string' : 'hash']
      : data.map;
  }

  var _getMapData = getMapData;

  /**
   * Removes `key` and its value from the map.
   *
   * @private
   * @name delete
   * @memberOf MapCache
   * @param {string} key The key of the value to remove.
   * @returns {boolean} Returns `true` if the entry was removed, else `false`.
   */
  function mapCacheDelete(key) {
    var result = _getMapData(this, key)['delete'](key);
    this.size -= result ? 1 : 0;
    return result;
  }

  var _mapCacheDelete = mapCacheDelete;

  /**
   * Gets the map value for `key`.
   *
   * @private
   * @name get
   * @memberOf MapCache
   * @param {string} key The key of the value to get.
   * @returns {*} Returns the entry value.
   */
  function mapCacheGet(key) {
    return _getMapData(this, key).get(key);
  }

  var _mapCacheGet = mapCacheGet;

  /**
   * Checks if a map value for `key` exists.
   *
   * @private
   * @name has
   * @memberOf MapCache
   * @param {string} key The key of the entry to check.
   * @returns {boolean} Returns `true` if an entry for `key` exists, else `false`.
   */
  function mapCacheHas(key) {
    return _getMapData(this, key).has(key);
  }

  var _mapCacheHas = mapCacheHas;

  /**
   * Sets the map `key` to `value`.
   *
   * @private
   * @name set
   * @memberOf MapCache
   * @param {string} key The key of the value to set.
   * @param {*} value The value to set.
   * @returns {Object} Returns the map cache instance.
   */
  function mapCacheSet(key, value) {
    var data = _getMapData(this, key),
        size = data.size;

    data.set(key, value);
    this.size += data.size == size ? 0 : 1;
    return this;
  }

  var _mapCacheSet = mapCacheSet;

  /**
   * Creates a map cache object to store key-value pairs.
   *
   * @private
   * @constructor
   * @param {Array} [entries] The key-value pairs to cache.
   */
  function MapCache(entries) {
    var index = -1,
        length = entries == null ? 0 : entries.length;

    this.clear();
    while (++index < length) {
      var entry = entries[index];
      this.set(entry[0], entry[1]);
    }
  }

  // Add methods to `MapCache`.
  MapCache.prototype.clear = _mapCacheClear;
  MapCache.prototype['delete'] = _mapCacheDelete;
  MapCache.prototype.get = _mapCacheGet;
  MapCache.prototype.has = _mapCacheHas;
  MapCache.prototype.set = _mapCacheSet;

  var _MapCache = MapCache;

  /** Used as the size to enable large array optimizations. */
  var LARGE_ARRAY_SIZE = 200;

  /**
   * Sets the stack `key` to `value`.
   *
   * @private
   * @name set
   * @memberOf Stack
   * @param {string} key The key of the value to set.
   * @param {*} value The value to set.
   * @returns {Object} Returns the stack cache instance.
   */
  function stackSet(key, value) {
    var data = this.__data__;
    if (data instanceof _ListCache) {
      var pairs = data.__data__;
      if (!_Map || (pairs.length < LARGE_ARRAY_SIZE - 1)) {
        pairs.push([key, value]);
        this.size = ++data.size;
        return this;
      }
      data = this.__data__ = new _MapCache(pairs);
    }
    data.set(key, value);
    this.size = data.size;
    return this;
  }

  var _stackSet = stackSet;

  /**
   * Creates a stack cache object to store key-value pairs.
   *
   * @private
   * @constructor
   * @param {Array} [entries] The key-value pairs to cache.
   */
  function Stack(entries) {
    var data = this.__data__ = new _ListCache(entries);
    this.size = data.size;
  }

  // Add methods to `Stack`.
  Stack.prototype.clear = _stackClear;
  Stack.prototype['delete'] = _stackDelete;
  Stack.prototype.get = _stackGet;
  Stack.prototype.has = _stackHas;
  Stack.prototype.set = _stackSet;

  var _Stack = Stack;

  /**
   * A specialized version of `_.forEach` for arrays without support for
   * iteratee shorthands.
   *
   * @private
   * @param {Array} [array] The array to iterate over.
   * @param {Function} iteratee The function invoked per iteration.
   * @returns {Array} Returns `array`.
   */
  function arrayEach(array, iteratee) {
    var index = -1,
        length = array == null ? 0 : array.length;

    while (++index < length) {
      if (iteratee(array[index], index, array) === false) {
        break;
      }
    }
    return array;
  }

  var _arrayEach = arrayEach;

  var defineProperty = (function() {
    try {
      var func = _getNative(Object, 'defineProperty');
      func({}, '', {});
      return func;
    } catch (e) {}
  }());

  var _defineProperty = defineProperty;

  /**
   * The base implementation of `assignValue` and `assignMergeValue` without
   * value checks.
   *
   * @private
   * @param {Object} object The object to modify.
   * @param {string} key The key of the property to assign.
   * @param {*} value The value to assign.
   */
  function baseAssignValue(object, key, value) {
    if (key == '__proto__' && _defineProperty) {
      _defineProperty(object, key, {
        'configurable': true,
        'enumerable': true,
        'value': value,
        'writable': true
      });
    } else {
      object[key] = value;
    }
  }

  var _baseAssignValue = baseAssignValue;

  /** Used for built-in method references. */
  var objectProto$5 = Object.prototype;

  /** Used to check objects for own properties. */
  var hasOwnProperty$4 = objectProto$5.hasOwnProperty;

  /**
   * Assigns `value` to `key` of `object` if the existing value is not equivalent
   * using [`SameValueZero`](http://ecma-international.org/ecma-262/7.0/#sec-samevaluezero)
   * for equality comparisons.
   *
   * @private
   * @param {Object} object The object to modify.
   * @param {string} key The key of the property to assign.
   * @param {*} value The value to assign.
   */
  function assignValue(object, key, value) {
    var objValue = object[key];
    if (!(hasOwnProperty$4.call(object, key) && eq_1(objValue, value)) ||
        (value === undefined && !(key in object))) {
      _baseAssignValue(object, key, value);
    }
  }

  var _assignValue = assignValue;

  /**
   * Copies properties of `source` to `object`.
   *
   * @private
   * @param {Object} source The object to copy properties from.
   * @param {Array} props The property identifiers to copy.
   * @param {Object} [object={}] The object to copy properties to.
   * @param {Function} [customizer] The function to customize copied values.
   * @returns {Object} Returns `object`.
   */
  function copyObject(source, props, object, customizer) {
    var isNew = !object;
    object || (object = {});

    var index = -1,
        length = props.length;

    while (++index < length) {
      var key = props[index];

      var newValue = customizer
        ? customizer(object[key], source[key], key, object, source)
        : undefined;

      if (newValue === undefined) {
        newValue = source[key];
      }
      if (isNew) {
        _baseAssignValue(object, key, newValue);
      } else {
        _assignValue(object, key, newValue);
      }
    }
    return object;
  }

  var _copyObject = copyObject;

  /**
   * The base implementation of `_.times` without support for iteratee shorthands
   * or max array length checks.
   *
   * @private
   * @param {number} n The number of times to invoke `iteratee`.
   * @param {Function} iteratee The function invoked per iteration.
   * @returns {Array} Returns the array of results.
   */
  function baseTimes(n, iteratee) {
    var index = -1,
        result = Array(n);

    while (++index < n) {
      result[index] = iteratee(index);
    }
    return result;
  }

  var _baseTimes = baseTimes;

  /**
   * Checks if `value` is object-like. A value is object-like if it's not `null`
   * and has a `typeof` result of "object".
   *
   * @static
   * @memberOf _
   * @since 4.0.0
   * @category Lang
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is object-like, else `false`.
   * @example
   *
   * _.isObjectLike({});
   * // => true
   *
   * _.isObjectLike([1, 2, 3]);
   * // => true
   *
   * _.isObjectLike(_.noop);
   * // => false
   *
   * _.isObjectLike(null);
   * // => false
   */
  function isObjectLike(value) {
    return value != null && typeof value == 'object';
  }

  var isObjectLike_1 = isObjectLike;

  /** `Object#toString` result references. */
  var argsTag = '[object Arguments]';

  /**
   * The base implementation of `_.isArguments`.
   *
   * @private
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is an `arguments` object,
   */
  function baseIsArguments(value) {
    return isObjectLike_1(value) && _baseGetTag(value) == argsTag;
  }

  var _baseIsArguments = baseIsArguments;

  /** Used for built-in method references. */
  var objectProto$6 = Object.prototype;

  /** Used to check objects for own properties. */
  var hasOwnProperty$5 = objectProto$6.hasOwnProperty;

  /** Built-in value references. */
  var propertyIsEnumerable = objectProto$6.propertyIsEnumerable;

  /**
   * Checks if `value` is likely an `arguments` object.
   *
   * @static
   * @memberOf _
   * @since 0.1.0
   * @category Lang
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is an `arguments` object,
   *  else `false`.
   * @example
   *
   * _.isArguments(function() { return arguments; }());
   * // => true
   *
   * _.isArguments([1, 2, 3]);
   * // => false
   */
  var isArguments = _baseIsArguments(function() { return arguments; }()) ? _baseIsArguments : function(value) {
    return isObjectLike_1(value) && hasOwnProperty$5.call(value, 'callee') &&
      !propertyIsEnumerable.call(value, 'callee');
  };

  var isArguments_1 = isArguments;

  /**
   * Checks if `value` is classified as an `Array` object.
   *
   * @static
   * @memberOf _
   * @since 0.1.0
   * @category Lang
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is an array, else `false`.
   * @example
   *
   * _.isArray([1, 2, 3]);
   * // => true
   *
   * _.isArray(document.body.children);
   * // => false
   *
   * _.isArray('abc');
   * // => false
   *
   * _.isArray(_.noop);
   * // => false
   */
  var isArray$1 = Array.isArray;

  var isArray_1 = isArray$1;

  /**
   * This method returns `false`.
   *
   * @static
   * @memberOf _
   * @since 4.13.0
   * @category Util
   * @returns {boolean} Returns `false`.
   * @example
   *
   * _.times(2, _.stubFalse);
   * // => [false, false]
   */
  function stubFalse() {
    return false;
  }

  var stubFalse_1 = stubFalse;

  var isBuffer_1 = createCommonjsModule(function (module, exports) {
  /** Detect free variable `exports`. */
  var freeExports = exports && !exports.nodeType && exports;

  /** Detect free variable `module`. */
  var freeModule = freeExports && 'object' == 'object' && module && !module.nodeType && module;

  /** Detect the popular CommonJS extension `module.exports`. */
  var moduleExports = freeModule && freeModule.exports === freeExports;

  /** Built-in value references. */
  var Buffer = moduleExports ? _root.Buffer : undefined;

  /* Built-in method references for those with the same name as other `lodash` methods. */
  var nativeIsBuffer = Buffer ? Buffer.isBuffer : undefined;

  /**
   * Checks if `value` is a buffer.
   *
   * @static
   * @memberOf _
   * @since 4.3.0
   * @category Lang
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is a buffer, else `false`.
   * @example
   *
   * _.isBuffer(new Buffer(2));
   * // => true
   *
   * _.isBuffer(new Uint8Array(2));
   * // => false
   */
  var isBuffer = nativeIsBuffer || stubFalse_1;

  module.exports = isBuffer;
  });

  /** Used as references for various `Number` constants. */
  var MAX_SAFE_INTEGER = 9007199254740991;

  /** Used to detect unsigned integer values. */
  var reIsUint = /^(?:0|[1-9]\d*)$/;

  /**
   * Checks if `value` is a valid array-like index.
   *
   * @private
   * @param {*} value The value to check.
   * @param {number} [length=MAX_SAFE_INTEGER] The upper bounds of a valid index.
   * @returns {boolean} Returns `true` if `value` is a valid index, else `false`.
   */
  function isIndex(value, length) {
    var type = typeof value;
    length = length == null ? MAX_SAFE_INTEGER : length;

    return !!length &&
      (type == 'number' ||
        (type != 'symbol' && reIsUint.test(value))) &&
          (value > -1 && value % 1 == 0 && value < length);
  }

  var _isIndex = isIndex;

  /** Used as references for various `Number` constants. */
  var MAX_SAFE_INTEGER$1 = 9007199254740991;

  /**
   * Checks if `value` is a valid array-like length.
   *
   * **Note:** This method is loosely based on
   * [`ToLength`](http://ecma-international.org/ecma-262/7.0/#sec-tolength).
   *
   * @static
   * @memberOf _
   * @since 4.0.0
   * @category Lang
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is a valid length, else `false`.
   * @example
   *
   * _.isLength(3);
   * // => true
   *
   * _.isLength(Number.MIN_VALUE);
   * // => false
   *
   * _.isLength(Infinity);
   * // => false
   *
   * _.isLength('3');
   * // => false
   */
  function isLength(value) {
    return typeof value == 'number' &&
      value > -1 && value % 1 == 0 && value <= MAX_SAFE_INTEGER$1;
  }

  var isLength_1 = isLength;

  /** `Object#toString` result references. */
  var argsTag$1 = '[object Arguments]',
      arrayTag = '[object Array]',
      boolTag = '[object Boolean]',
      dateTag = '[object Date]',
      errorTag = '[object Error]',
      funcTag$1 = '[object Function]',
      mapTag = '[object Map]',
      numberTag = '[object Number]',
      objectTag = '[object Object]',
      regexpTag = '[object RegExp]',
      setTag = '[object Set]',
      stringTag = '[object String]',
      weakMapTag = '[object WeakMap]';

  var arrayBufferTag = '[object ArrayBuffer]',
      dataViewTag = '[object DataView]',
      float32Tag = '[object Float32Array]',
      float64Tag = '[object Float64Array]',
      int8Tag = '[object Int8Array]',
      int16Tag = '[object Int16Array]',
      int32Tag = '[object Int32Array]',
      uint8Tag = '[object Uint8Array]',
      uint8ClampedTag = '[object Uint8ClampedArray]',
      uint16Tag = '[object Uint16Array]',
      uint32Tag = '[object Uint32Array]';

  /** Used to identify `toStringTag` values of typed arrays. */
  var typedArrayTags = {};
  typedArrayTags[float32Tag] = typedArrayTags[float64Tag] =
  typedArrayTags[int8Tag] = typedArrayTags[int16Tag] =
  typedArrayTags[int32Tag] = typedArrayTags[uint8Tag] =
  typedArrayTags[uint8ClampedTag] = typedArrayTags[uint16Tag] =
  typedArrayTags[uint32Tag] = true;
  typedArrayTags[argsTag$1] = typedArrayTags[arrayTag] =
  typedArrayTags[arrayBufferTag] = typedArrayTags[boolTag] =
  typedArrayTags[dataViewTag] = typedArrayTags[dateTag] =
  typedArrayTags[errorTag] = typedArrayTags[funcTag$1] =
  typedArrayTags[mapTag] = typedArrayTags[numberTag] =
  typedArrayTags[objectTag] = typedArrayTags[regexpTag] =
  typedArrayTags[setTag] = typedArrayTags[stringTag] =
  typedArrayTags[weakMapTag] = false;

  /**
   * The base implementation of `_.isTypedArray` without Node.js optimizations.
   *
   * @private
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is a typed array, else `false`.
   */
  function baseIsTypedArray(value) {
    return isObjectLike_1(value) &&
      isLength_1(value.length) && !!typedArrayTags[_baseGetTag(value)];
  }

  var _baseIsTypedArray = baseIsTypedArray;

  /**
   * The base implementation of `_.unary` without support for storing metadata.
   *
   * @private
   * @param {Function} func The function to cap arguments for.
   * @returns {Function} Returns the new capped function.
   */
  function baseUnary(func) {
    return function(value) {
      return func(value);
    };
  }

  var _baseUnary = baseUnary;

  var _nodeUtil = createCommonjsModule(function (module, exports) {
  /** Detect free variable `exports`. */
  var freeExports = exports && !exports.nodeType && exports;

  /** Detect free variable `module`. */
  var freeModule = freeExports && 'object' == 'object' && module && !module.nodeType && module;

  /** Detect the popular CommonJS extension `module.exports`. */
  var moduleExports = freeModule && freeModule.exports === freeExports;

  /** Detect free variable `process` from Node.js. */
  var freeProcess = moduleExports && _freeGlobal.process;

  /** Used to access faster Node.js helpers. */
  var nodeUtil = (function() {
    try {
      // Use `util.types` for Node.js 10+.
      var types = freeModule && freeModule.require && freeModule.require('util').types;

      if (types) {
        return types;
      }

      // Legacy `process.binding('util')` for Node.js < 10.
      return freeProcess && freeProcess.binding && freeProcess.binding('util');
    } catch (e) {}
  }());

  module.exports = nodeUtil;
  });

  /* Node.js helper references. */
  var nodeIsTypedArray = _nodeUtil && _nodeUtil.isTypedArray;

  /**
   * Checks if `value` is classified as a typed array.
   *
   * @static
   * @memberOf _
   * @since 3.0.0
   * @category Lang
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is a typed array, else `false`.
   * @example
   *
   * _.isTypedArray(new Uint8Array);
   * // => true
   *
   * _.isTypedArray([]);
   * // => false
   */
  var isTypedArray = nodeIsTypedArray ? _baseUnary(nodeIsTypedArray) : _baseIsTypedArray;

  var isTypedArray_1 = isTypedArray;

  /** Used for built-in method references. */
  var objectProto$7 = Object.prototype;

  /** Used to check objects for own properties. */
  var hasOwnProperty$6 = objectProto$7.hasOwnProperty;

  /**
   * Creates an array of the enumerable property names of the array-like `value`.
   *
   * @private
   * @param {*} value The value to query.
   * @param {boolean} inherited Specify returning inherited property names.
   * @returns {Array} Returns the array of property names.
   */
  function arrayLikeKeys(value, inherited) {
    var isArr = isArray_1(value),
        isArg = !isArr && isArguments_1(value),
        isBuff = !isArr && !isArg && isBuffer_1(value),
        isType = !isArr && !isArg && !isBuff && isTypedArray_1(value),
        skipIndexes = isArr || isArg || isBuff || isType,
        result = skipIndexes ? _baseTimes(value.length, String) : [],
        length = result.length;

    for (var key in value) {
      if ((inherited || hasOwnProperty$6.call(value, key)) &&
          !(skipIndexes && (
             // Safari 9 has enumerable `arguments.length` in strict mode.
             key == 'length' ||
             // Node.js 0.10 has enumerable non-index properties on buffers.
             (isBuff && (key == 'offset' || key == 'parent')) ||
             // PhantomJS 2 has enumerable non-index properties on typed arrays.
             (isType && (key == 'buffer' || key == 'byteLength' || key == 'byteOffset')) ||
             // Skip index properties.
             _isIndex(key, length)
          ))) {
        result.push(key);
      }
    }
    return result;
  }

  var _arrayLikeKeys = arrayLikeKeys;

  /** Used for built-in method references. */
  var objectProto$8 = Object.prototype;

  /**
   * Checks if `value` is likely a prototype object.
   *
   * @private
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is a prototype, else `false`.
   */
  function isPrototype(value) {
    var Ctor = value && value.constructor,
        proto = (typeof Ctor == 'function' && Ctor.prototype) || objectProto$8;

    return value === proto;
  }

  var _isPrototype = isPrototype;

  /**
   * Creates a unary function that invokes `func` with its argument transformed.
   *
   * @private
   * @param {Function} func The function to wrap.
   * @param {Function} transform The argument transform.
   * @returns {Function} Returns the new function.
   */
  function overArg(func, transform) {
    return function(arg) {
      return func(transform(arg));
    };
  }

  var _overArg = overArg;

  /* Built-in method references for those with the same name as other `lodash` methods. */
  var nativeKeys = _overArg(Object.keys, Object);

  var _nativeKeys = nativeKeys;

  /** Used for built-in method references. */
  var objectProto$9 = Object.prototype;

  /** Used to check objects for own properties. */
  var hasOwnProperty$7 = objectProto$9.hasOwnProperty;

  /**
   * The base implementation of `_.keys` which doesn't treat sparse arrays as dense.
   *
   * @private
   * @param {Object} object The object to query.
   * @returns {Array} Returns the array of property names.
   */
  function baseKeys(object) {
    if (!_isPrototype(object)) {
      return _nativeKeys(object);
    }
    var result = [];
    for (var key in Object(object)) {
      if (hasOwnProperty$7.call(object, key) && key != 'constructor') {
        result.push(key);
      }
    }
    return result;
  }

  var _baseKeys = baseKeys;

  /**
   * Checks if `value` is array-like. A value is considered array-like if it's
   * not a function and has a `value.length` that's an integer greater than or
   * equal to `0` and less than or equal to `Number.MAX_SAFE_INTEGER`.
   *
   * @static
   * @memberOf _
   * @since 4.0.0
   * @category Lang
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is array-like, else `false`.
   * @example
   *
   * _.isArrayLike([1, 2, 3]);
   * // => true
   *
   * _.isArrayLike(document.body.children);
   * // => true
   *
   * _.isArrayLike('abc');
   * // => true
   *
   * _.isArrayLike(_.noop);
   * // => false
   */
  function isArrayLike(value) {
    return value != null && isLength_1(value.length) && !isFunction_1(value);
  }

  var isArrayLike_1 = isArrayLike;

  /**
   * Creates an array of the own enumerable property names of `object`.
   *
   * **Note:** Non-object values are coerced to objects. See the
   * [ES spec](http://ecma-international.org/ecma-262/7.0/#sec-object.keys)
   * for more details.
   *
   * @static
   * @since 0.1.0
   * @memberOf _
   * @category Object
   * @param {Object} object The object to query.
   * @returns {Array} Returns the array of property names.
   * @example
   *
   * function Foo() {
   *   this.a = 1;
   *   this.b = 2;
   * }
   *
   * Foo.prototype.c = 3;
   *
   * _.keys(new Foo);
   * // => ['a', 'b'] (iteration order is not guaranteed)
   *
   * _.keys('hi');
   * // => ['0', '1']
   */
  function keys(object) {
    return isArrayLike_1(object) ? _arrayLikeKeys(object) : _baseKeys(object);
  }

  var keys_1 = keys;

  /**
   * The base implementation of `_.assign` without support for multiple sources
   * or `customizer` functions.
   *
   * @private
   * @param {Object} object The destination object.
   * @param {Object} source The source object.
   * @returns {Object} Returns `object`.
   */
  function baseAssign(object, source) {
    return object && _copyObject(source, keys_1(source), object);
  }

  var _baseAssign = baseAssign;

  /**
   * This function is like
   * [`Object.keys`](http://ecma-international.org/ecma-262/7.0/#sec-object.keys)
   * except that it includes inherited enumerable properties.
   *
   * @private
   * @param {Object} object The object to query.
   * @returns {Array} Returns the array of property names.
   */
  function nativeKeysIn(object) {
    var result = [];
    if (object != null) {
      for (var key in Object(object)) {
        result.push(key);
      }
    }
    return result;
  }

  var _nativeKeysIn = nativeKeysIn;

  /** Used for built-in method references. */
  var objectProto$a = Object.prototype;

  /** Used to check objects for own properties. */
  var hasOwnProperty$8 = objectProto$a.hasOwnProperty;

  /**
   * The base implementation of `_.keysIn` which doesn't treat sparse arrays as dense.
   *
   * @private
   * @param {Object} object The object to query.
   * @returns {Array} Returns the array of property names.
   */
  function baseKeysIn(object) {
    if (!isObject_1(object)) {
      return _nativeKeysIn(object);
    }
    var isProto = _isPrototype(object),
        result = [];

    for (var key in object) {
      if (!(key == 'constructor' && (isProto || !hasOwnProperty$8.call(object, key)))) {
        result.push(key);
      }
    }
    return result;
  }

  var _baseKeysIn = baseKeysIn;

  /**
   * Creates an array of the own and inherited enumerable property names of `object`.
   *
   * **Note:** Non-object values are coerced to objects.
   *
   * @static
   * @memberOf _
   * @since 3.0.0
   * @category Object
   * @param {Object} object The object to query.
   * @returns {Array} Returns the array of property names.
   * @example
   *
   * function Foo() {
   *   this.a = 1;
   *   this.b = 2;
   * }
   *
   * Foo.prototype.c = 3;
   *
   * _.keysIn(new Foo);
   * // => ['a', 'b', 'c'] (iteration order is not guaranteed)
   */
  function keysIn$1(object) {
    return isArrayLike_1(object) ? _arrayLikeKeys(object, true) : _baseKeysIn(object);
  }

  var keysIn_1 = keysIn$1;

  /**
   * The base implementation of `_.assignIn` without support for multiple sources
   * or `customizer` functions.
   *
   * @private
   * @param {Object} object The destination object.
   * @param {Object} source The source object.
   * @returns {Object} Returns `object`.
   */
  function baseAssignIn(object, source) {
    return object && _copyObject(source, keysIn_1(source), object);
  }

  var _baseAssignIn = baseAssignIn;

  var _cloneBuffer = createCommonjsModule(function (module, exports) {
  /** Detect free variable `exports`. */
  var freeExports = exports && !exports.nodeType && exports;

  /** Detect free variable `module`. */
  var freeModule = freeExports && 'object' == 'object' && module && !module.nodeType && module;

  /** Detect the popular CommonJS extension `module.exports`. */
  var moduleExports = freeModule && freeModule.exports === freeExports;

  /** Built-in value references. */
  var Buffer = moduleExports ? _root.Buffer : undefined,
      allocUnsafe = Buffer ? Buffer.allocUnsafe : undefined;

  /**
   * Creates a clone of  `buffer`.
   *
   * @private
   * @param {Buffer} buffer The buffer to clone.
   * @param {boolean} [isDeep] Specify a deep clone.
   * @returns {Buffer} Returns the cloned buffer.
   */
  function cloneBuffer(buffer, isDeep) {
    if (isDeep) {
      return buffer.slice();
    }
    var length = buffer.length,
        result = allocUnsafe ? allocUnsafe(length) : new buffer.constructor(length);

    buffer.copy(result);
    return result;
  }

  module.exports = cloneBuffer;
  });

  /**
   * Copies the values of `source` to `array`.
   *
   * @private
   * @param {Array} source The array to copy values from.
   * @param {Array} [array=[]] The array to copy values to.
   * @returns {Array} Returns `array`.
   */
  function copyArray(source, array) {
    var index = -1,
        length = source.length;

    array || (array = Array(length));
    while (++index < length) {
      array[index] = source[index];
    }
    return array;
  }

  var _copyArray = copyArray;

  /**
   * A specialized version of `_.filter` for arrays without support for
   * iteratee shorthands.
   *
   * @private
   * @param {Array} [array] The array to iterate over.
   * @param {Function} predicate The function invoked per iteration.
   * @returns {Array} Returns the new filtered array.
   */
  function arrayFilter(array, predicate) {
    var index = -1,
        length = array == null ? 0 : array.length,
        resIndex = 0,
        result = [];

    while (++index < length) {
      var value = array[index];
      if (predicate(value, index, array)) {
        result[resIndex++] = value;
      }
    }
    return result;
  }

  var _arrayFilter = arrayFilter;

  /**
   * This method returns a new empty array.
   *
   * @static
   * @memberOf _
   * @since 4.13.0
   * @category Util
   * @returns {Array} Returns the new empty array.
   * @example
   *
   * var arrays = _.times(2, _.stubArray);
   *
   * console.log(arrays);
   * // => [[], []]
   *
   * console.log(arrays[0] === arrays[1]);
   * // => false
   */
  function stubArray() {
    return [];
  }

  var stubArray_1 = stubArray;

  /** Used for built-in method references. */
  var objectProto$b = Object.prototype;

  /** Built-in value references. */
  var propertyIsEnumerable$1 = objectProto$b.propertyIsEnumerable;

  /* Built-in method references for those with the same name as other `lodash` methods. */
  var nativeGetSymbols = Object.getOwnPropertySymbols;

  /**
   * Creates an array of the own enumerable symbols of `object`.
   *
   * @private
   * @param {Object} object The object to query.
   * @returns {Array} Returns the array of symbols.
   */
  var getSymbols = !nativeGetSymbols ? stubArray_1 : function(object) {
    if (object == null) {
      return [];
    }
    object = Object(object);
    return _arrayFilter(nativeGetSymbols(object), function(symbol) {
      return propertyIsEnumerable$1.call(object, symbol);
    });
  };

  var _getSymbols = getSymbols;

  /**
   * Copies own symbols of `source` to `object`.
   *
   * @private
   * @param {Object} source The object to copy symbols from.
   * @param {Object} [object={}] The object to copy symbols to.
   * @returns {Object} Returns `object`.
   */
  function copySymbols(source, object) {
    return _copyObject(source, _getSymbols(source), object);
  }

  var _copySymbols = copySymbols;

  /**
   * Appends the elements of `values` to `array`.
   *
   * @private
   * @param {Array} array The array to modify.
   * @param {Array} values The values to append.
   * @returns {Array} Returns `array`.
   */
  function arrayPush(array, values) {
    var index = -1,
        length = values.length,
        offset = array.length;

    while (++index < length) {
      array[offset + index] = values[index];
    }
    return array;
  }

  var _arrayPush = arrayPush;

  /** Built-in value references. */
  var getPrototype = _overArg(Object.getPrototypeOf, Object);

  var _getPrototype = getPrototype;

  /* Built-in method references for those with the same name as other `lodash` methods. */
  var nativeGetSymbols$1 = Object.getOwnPropertySymbols;

  /**
   * Creates an array of the own and inherited enumerable symbols of `object`.
   *
   * @private
   * @param {Object} object The object to query.
   * @returns {Array} Returns the array of symbols.
   */
  var getSymbolsIn = !nativeGetSymbols$1 ? stubArray_1 : function(object) {
    var result = [];
    while (object) {
      _arrayPush(result, _getSymbols(object));
      object = _getPrototype(object);
    }
    return result;
  };

  var _getSymbolsIn = getSymbolsIn;

  /**
   * Copies own and inherited symbols of `source` to `object`.
   *
   * @private
   * @param {Object} source The object to copy symbols from.
   * @param {Object} [object={}] The object to copy symbols to.
   * @returns {Object} Returns `object`.
   */
  function copySymbolsIn(source, object) {
    return _copyObject(source, _getSymbolsIn(source), object);
  }

  var _copySymbolsIn = copySymbolsIn;

  /**
   * The base implementation of `getAllKeys` and `getAllKeysIn` which uses
   * `keysFunc` and `symbolsFunc` to get the enumerable property names and
   * symbols of `object`.
   *
   * @private
   * @param {Object} object The object to query.
   * @param {Function} keysFunc The function to get the keys of `object`.
   * @param {Function} symbolsFunc The function to get the symbols of `object`.
   * @returns {Array} Returns the array of property names and symbols.
   */
  function baseGetAllKeys(object, keysFunc, symbolsFunc) {
    var result = keysFunc(object);
    return isArray_1(object) ? result : _arrayPush(result, symbolsFunc(object));
  }

  var _baseGetAllKeys = baseGetAllKeys;

  /**
   * Creates an array of own enumerable property names and symbols of `object`.
   *
   * @private
   * @param {Object} object The object to query.
   * @returns {Array} Returns the array of property names and symbols.
   */
  function getAllKeys(object) {
    return _baseGetAllKeys(object, keys_1, _getSymbols);
  }

  var _getAllKeys = getAllKeys;

  /**
   * Creates an array of own and inherited enumerable property names and
   * symbols of `object`.
   *
   * @private
   * @param {Object} object The object to query.
   * @returns {Array} Returns the array of property names and symbols.
   */
  function getAllKeysIn(object) {
    return _baseGetAllKeys(object, keysIn_1, _getSymbolsIn);
  }

  var _getAllKeysIn = getAllKeysIn;

  /* Built-in method references that are verified to be native. */
  var DataView = _getNative(_root, 'DataView');

  var _DataView = DataView;

  /* Built-in method references that are verified to be native. */
  var Promise$1 = _getNative(_root, 'Promise');

  var _Promise = Promise$1;

  /* Built-in method references that are verified to be native. */
  var Set$1 = _getNative(_root, 'Set');

  var _Set = Set$1;

  /* Built-in method references that are verified to be native. */
  var WeakMap = _getNative(_root, 'WeakMap');

  var _WeakMap = WeakMap;

  /** `Object#toString` result references. */
  var mapTag$1 = '[object Map]',
      objectTag$1 = '[object Object]',
      promiseTag = '[object Promise]',
      setTag$1 = '[object Set]',
      weakMapTag$1 = '[object WeakMap]';

  var dataViewTag$1 = '[object DataView]';

  /** Used to detect maps, sets, and weakmaps. */
  var dataViewCtorString = _toSource(_DataView),
      mapCtorString = _toSource(_Map),
      promiseCtorString = _toSource(_Promise),
      setCtorString = _toSource(_Set),
      weakMapCtorString = _toSource(_WeakMap);

  /**
   * Gets the `toStringTag` of `value`.
   *
   * @private
   * @param {*} value The value to query.
   * @returns {string} Returns the `toStringTag`.
   */
  var getTag = _baseGetTag;

  // Fallback for data views, maps, sets, and weak maps in IE 11 and promises in Node.js < 6.
  if ((_DataView && getTag(new _DataView(new ArrayBuffer(1))) != dataViewTag$1) ||
      (_Map && getTag(new _Map) != mapTag$1) ||
      (_Promise && getTag(_Promise.resolve()) != promiseTag) ||
      (_Set && getTag(new _Set) != setTag$1) ||
      (_WeakMap && getTag(new _WeakMap) != weakMapTag$1)) {
    getTag = function(value) {
      var result = _baseGetTag(value),
          Ctor = result == objectTag$1 ? value.constructor : undefined,
          ctorString = Ctor ? _toSource(Ctor) : '';

      if (ctorString) {
        switch (ctorString) {
          case dataViewCtorString: return dataViewTag$1;
          case mapCtorString: return mapTag$1;
          case promiseCtorString: return promiseTag;
          case setCtorString: return setTag$1;
          case weakMapCtorString: return weakMapTag$1;
        }
      }
      return result;
    };
  }

  var _getTag = getTag;

  /** Used for built-in method references. */
  var objectProto$c = Object.prototype;

  /** Used to check objects for own properties. */
  var hasOwnProperty$9 = objectProto$c.hasOwnProperty;

  /**
   * Initializes an array clone.
   *
   * @private
   * @param {Array} array The array to clone.
   * @returns {Array} Returns the initialized clone.
   */
  function initCloneArray(array) {
    var length = array.length,
        result = new array.constructor(length);

    // Add properties assigned by `RegExp#exec`.
    if (length && typeof array[0] == 'string' && hasOwnProperty$9.call(array, 'index')) {
      result.index = array.index;
      result.input = array.input;
    }
    return result;
  }

  var _initCloneArray = initCloneArray;

  /** Built-in value references. */
  var Uint8Array = _root.Uint8Array;

  var _Uint8Array = Uint8Array;

  /**
   * Creates a clone of `arrayBuffer`.
   *
   * @private
   * @param {ArrayBuffer} arrayBuffer The array buffer to clone.
   * @returns {ArrayBuffer} Returns the cloned array buffer.
   */
  function cloneArrayBuffer(arrayBuffer) {
    var result = new arrayBuffer.constructor(arrayBuffer.byteLength);
    new _Uint8Array(result).set(new _Uint8Array(arrayBuffer));
    return result;
  }

  var _cloneArrayBuffer = cloneArrayBuffer;

  /**
   * Creates a clone of `dataView`.
   *
   * @private
   * @param {Object} dataView The data view to clone.
   * @param {boolean} [isDeep] Specify a deep clone.
   * @returns {Object} Returns the cloned data view.
   */
  function cloneDataView(dataView, isDeep) {
    var buffer = isDeep ? _cloneArrayBuffer(dataView.buffer) : dataView.buffer;
    return new dataView.constructor(buffer, dataView.byteOffset, dataView.byteLength);
  }

  var _cloneDataView = cloneDataView;

  /** Used to match `RegExp` flags from their coerced string values. */
  var reFlags = /\w*$/;

  /**
   * Creates a clone of `regexp`.
   *
   * @private
   * @param {Object} regexp The regexp to clone.
   * @returns {Object} Returns the cloned regexp.
   */
  function cloneRegExp(regexp) {
    var result = new regexp.constructor(regexp.source, reFlags.exec(regexp));
    result.lastIndex = regexp.lastIndex;
    return result;
  }

  var _cloneRegExp = cloneRegExp;

  /** Used to convert symbols to primitives and strings. */
  var symbolProto = _Symbol ? _Symbol.prototype : undefined,
      symbolValueOf = symbolProto ? symbolProto.valueOf : undefined;

  /**
   * Creates a clone of the `symbol` object.
   *
   * @private
   * @param {Object} symbol The symbol object to clone.
   * @returns {Object} Returns the cloned symbol object.
   */
  function cloneSymbol(symbol) {
    return symbolValueOf ? Object(symbolValueOf.call(symbol)) : {};
  }

  var _cloneSymbol = cloneSymbol;

  /**
   * Creates a clone of `typedArray`.
   *
   * @private
   * @param {Object} typedArray The typed array to clone.
   * @param {boolean} [isDeep] Specify a deep clone.
   * @returns {Object} Returns the cloned typed array.
   */
  function cloneTypedArray(typedArray, isDeep) {
    var buffer = isDeep ? _cloneArrayBuffer(typedArray.buffer) : typedArray.buffer;
    return new typedArray.constructor(buffer, typedArray.byteOffset, typedArray.length);
  }

  var _cloneTypedArray = cloneTypedArray;

  /** `Object#toString` result references. */
  var boolTag$1 = '[object Boolean]',
      dateTag$1 = '[object Date]',
      mapTag$2 = '[object Map]',
      numberTag$1 = '[object Number]',
      regexpTag$1 = '[object RegExp]',
      setTag$2 = '[object Set]',
      stringTag$1 = '[object String]',
      symbolTag = '[object Symbol]';

  var arrayBufferTag$1 = '[object ArrayBuffer]',
      dataViewTag$2 = '[object DataView]',
      float32Tag$1 = '[object Float32Array]',
      float64Tag$1 = '[object Float64Array]',
      int8Tag$1 = '[object Int8Array]',
      int16Tag$1 = '[object Int16Array]',
      int32Tag$1 = '[object Int32Array]',
      uint8Tag$1 = '[object Uint8Array]',
      uint8ClampedTag$1 = '[object Uint8ClampedArray]',
      uint16Tag$1 = '[object Uint16Array]',
      uint32Tag$1 = '[object Uint32Array]';

  /**
   * Initializes an object clone based on its `toStringTag`.
   *
   * **Note:** This function only supports cloning values with tags of
   * `Boolean`, `Date`, `Error`, `Map`, `Number`, `RegExp`, `Set`, or `String`.
   *
   * @private
   * @param {Object} object The object to clone.
   * @param {string} tag The `toStringTag` of the object to clone.
   * @param {boolean} [isDeep] Specify a deep clone.
   * @returns {Object} Returns the initialized clone.
   */
  function initCloneByTag(object, tag, isDeep) {
    var Ctor = object.constructor;
    switch (tag) {
      case arrayBufferTag$1:
        return _cloneArrayBuffer(object);

      case boolTag$1:
      case dateTag$1:
        return new Ctor(+object);

      case dataViewTag$2:
        return _cloneDataView(object, isDeep);

      case float32Tag$1: case float64Tag$1:
      case int8Tag$1: case int16Tag$1: case int32Tag$1:
      case uint8Tag$1: case uint8ClampedTag$1: case uint16Tag$1: case uint32Tag$1:
        return _cloneTypedArray(object, isDeep);

      case mapTag$2:
        return new Ctor;

      case numberTag$1:
      case stringTag$1:
        return new Ctor(object);

      case regexpTag$1:
        return _cloneRegExp(object);

      case setTag$2:
        return new Ctor;

      case symbolTag:
        return _cloneSymbol(object);
    }
  }

  var _initCloneByTag = initCloneByTag;

  /** Built-in value references. */
  var objectCreate = Object.create;

  /**
   * The base implementation of `_.create` without support for assigning
   * properties to the created object.
   *
   * @private
   * @param {Object} proto The object to inherit from.
   * @returns {Object} Returns the new object.
   */
  var baseCreate = (function() {
    function object() {}
    return function(proto) {
      if (!isObject_1(proto)) {
        return {};
      }
      if (objectCreate) {
        return objectCreate(proto);
      }
      object.prototype = proto;
      var result = new object;
      object.prototype = undefined;
      return result;
    };
  }());

  var _baseCreate = baseCreate;

  /**
   * Initializes an object clone.
   *
   * @private
   * @param {Object} object The object to clone.
   * @returns {Object} Returns the initialized clone.
   */
  function initCloneObject(object) {
    return (typeof object.constructor == 'function' && !_isPrototype(object))
      ? _baseCreate(_getPrototype(object))
      : {};
  }

  var _initCloneObject = initCloneObject;

  /** `Object#toString` result references. */
  var mapTag$3 = '[object Map]';

  /**
   * The base implementation of `_.isMap` without Node.js optimizations.
   *
   * @private
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is a map, else `false`.
   */
  function baseIsMap(value) {
    return isObjectLike_1(value) && _getTag(value) == mapTag$3;
  }

  var _baseIsMap = baseIsMap;

  /* Node.js helper references. */
  var nodeIsMap = _nodeUtil && _nodeUtil.isMap;

  /**
   * Checks if `value` is classified as a `Map` object.
   *
   * @static
   * @memberOf _
   * @since 4.3.0
   * @category Lang
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is a map, else `false`.
   * @example
   *
   * _.isMap(new Map);
   * // => true
   *
   * _.isMap(new WeakMap);
   * // => false
   */
  var isMap = nodeIsMap ? _baseUnary(nodeIsMap) : _baseIsMap;

  var isMap_1 = isMap;

  /** `Object#toString` result references. */
  var setTag$3 = '[object Set]';

  /**
   * The base implementation of `_.isSet` without Node.js optimizations.
   *
   * @private
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is a set, else `false`.
   */
  function baseIsSet(value) {
    return isObjectLike_1(value) && _getTag(value) == setTag$3;
  }

  var _baseIsSet = baseIsSet;

  /* Node.js helper references. */
  var nodeIsSet = _nodeUtil && _nodeUtil.isSet;

  /**
   * Checks if `value` is classified as a `Set` object.
   *
   * @static
   * @memberOf _
   * @since 4.3.0
   * @category Lang
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is a set, else `false`.
   * @example
   *
   * _.isSet(new Set);
   * // => true
   *
   * _.isSet(new WeakSet);
   * // => false
   */
  var isSet = nodeIsSet ? _baseUnary(nodeIsSet) : _baseIsSet;

  var isSet_1 = isSet;

  /** Used to compose bitmasks for cloning. */
  var CLONE_DEEP_FLAG = 1,
      CLONE_FLAT_FLAG = 2,
      CLONE_SYMBOLS_FLAG = 4;

  /** `Object#toString` result references. */
  var argsTag$2 = '[object Arguments]',
      arrayTag$1 = '[object Array]',
      boolTag$2 = '[object Boolean]',
      dateTag$2 = '[object Date]',
      errorTag$1 = '[object Error]',
      funcTag$2 = '[object Function]',
      genTag$1 = '[object GeneratorFunction]',
      mapTag$4 = '[object Map]',
      numberTag$2 = '[object Number]',
      objectTag$2 = '[object Object]',
      regexpTag$2 = '[object RegExp]',
      setTag$4 = '[object Set]',
      stringTag$2 = '[object String]',
      symbolTag$1 = '[object Symbol]',
      weakMapTag$2 = '[object WeakMap]';

  var arrayBufferTag$2 = '[object ArrayBuffer]',
      dataViewTag$3 = '[object DataView]',
      float32Tag$2 = '[object Float32Array]',
      float64Tag$2 = '[object Float64Array]',
      int8Tag$2 = '[object Int8Array]',
      int16Tag$2 = '[object Int16Array]',
      int32Tag$2 = '[object Int32Array]',
      uint8Tag$2 = '[object Uint8Array]',
      uint8ClampedTag$2 = '[object Uint8ClampedArray]',
      uint16Tag$2 = '[object Uint16Array]',
      uint32Tag$2 = '[object Uint32Array]';

  /** Used to identify `toStringTag` values supported by `_.clone`. */
  var cloneableTags = {};
  cloneableTags[argsTag$2] = cloneableTags[arrayTag$1] =
  cloneableTags[arrayBufferTag$2] = cloneableTags[dataViewTag$3] =
  cloneableTags[boolTag$2] = cloneableTags[dateTag$2] =
  cloneableTags[float32Tag$2] = cloneableTags[float64Tag$2] =
  cloneableTags[int8Tag$2] = cloneableTags[int16Tag$2] =
  cloneableTags[int32Tag$2] = cloneableTags[mapTag$4] =
  cloneableTags[numberTag$2] = cloneableTags[objectTag$2] =
  cloneableTags[regexpTag$2] = cloneableTags[setTag$4] =
  cloneableTags[stringTag$2] = cloneableTags[symbolTag$1] =
  cloneableTags[uint8Tag$2] = cloneableTags[uint8ClampedTag$2] =
  cloneableTags[uint16Tag$2] = cloneableTags[uint32Tag$2] = true;
  cloneableTags[errorTag$1] = cloneableTags[funcTag$2] =
  cloneableTags[weakMapTag$2] = false;

  /**
   * The base implementation of `_.clone` and `_.cloneDeep` which tracks
   * traversed objects.
   *
   * @private
   * @param {*} value The value to clone.
   * @param {boolean} bitmask The bitmask flags.
   *  1 - Deep clone
   *  2 - Flatten inherited properties
   *  4 - Clone symbols
   * @param {Function} [customizer] The function to customize cloning.
   * @param {string} [key] The key of `value`.
   * @param {Object} [object] The parent object of `value`.
   * @param {Object} [stack] Tracks traversed objects and their clone counterparts.
   * @returns {*} Returns the cloned value.
   */
  function baseClone(value, bitmask, customizer, key, object, stack) {
    var result,
        isDeep = bitmask & CLONE_DEEP_FLAG,
        isFlat = bitmask & CLONE_FLAT_FLAG,
        isFull = bitmask & CLONE_SYMBOLS_FLAG;

    if (customizer) {
      result = object ? customizer(value, key, object, stack) : customizer(value);
    }
    if (result !== undefined) {
      return result;
    }
    if (!isObject_1(value)) {
      return value;
    }
    var isArr = isArray_1(value);
    if (isArr) {
      result = _initCloneArray(value);
      if (!isDeep) {
        return _copyArray(value, result);
      }
    } else {
      var tag = _getTag(value),
          isFunc = tag == funcTag$2 || tag == genTag$1;

      if (isBuffer_1(value)) {
        return _cloneBuffer(value, isDeep);
      }
      if (tag == objectTag$2 || tag == argsTag$2 || (isFunc && !object)) {
        result = (isFlat || isFunc) ? {} : _initCloneObject(value);
        if (!isDeep) {
          return isFlat
            ? _copySymbolsIn(value, _baseAssignIn(result, value))
            : _copySymbols(value, _baseAssign(result, value));
        }
      } else {
        if (!cloneableTags[tag]) {
          return object ? value : {};
        }
        result = _initCloneByTag(value, tag, isDeep);
      }
    }
    // Check for circular references and return its corresponding clone.
    stack || (stack = new _Stack);
    var stacked = stack.get(value);
    if (stacked) {
      return stacked;
    }
    stack.set(value, result);

    if (isSet_1(value)) {
      value.forEach(function(subValue) {
        result.add(baseClone(subValue, bitmask, customizer, subValue, value, stack));
      });

      return result;
    }

    if (isMap_1(value)) {
      value.forEach(function(subValue, key) {
        result.set(key, baseClone(subValue, bitmask, customizer, key, value, stack));
      });

      return result;
    }

    var keysFunc = isFull
      ? (isFlat ? _getAllKeysIn : _getAllKeys)
      : (isFlat ? keysIn : keys_1);

    var props = isArr ? undefined : keysFunc(value);
    _arrayEach(props || value, function(subValue, key) {
      if (props) {
        key = subValue;
        subValue = value[key];
      }
      // Recursively populate clone (susceptible to call stack limits).
      _assignValue(result, key, baseClone(subValue, bitmask, customizer, key, value, stack));
    });
    return result;
  }

  var _baseClone = baseClone;

  /** Used to compose bitmasks for cloning. */
  var CLONE_DEEP_FLAG$1 = 1,
      CLONE_SYMBOLS_FLAG$1 = 4;

  /**
   * This method is like `_.clone` except that it recursively clones `value`.
   *
   * @static
   * @memberOf _
   * @since 1.0.0
   * @category Lang
   * @param {*} value The value to recursively clone.
   * @returns {*} Returns the deep cloned value.
   * @see _.clone
   * @example
   *
   * var objects = [{ 'a': 1 }, { 'b': 2 }];
   *
   * var deep = _.cloneDeep(objects);
   * console.log(deep[0] === objects[0]);
   * // => false
   */
  function cloneDeep(value) {
    return _baseClone(value, CLONE_DEEP_FLAG$1 | CLONE_SYMBOLS_FLAG$1);
  }

  var cloneDeep_1 = cloneDeep;

  const createStore = () => {
    const s = {
      items: [],
      $: undefined,
      add: undefined,
      subscribe: undefined,
      unsubscribe: undefined
    };

    s.$ = new BehaviorSubject(s.items);

    const add = (item) => {
      const newState = cloneDeep_1(s.items);
      newState.push(item);
      s.items = newState;
      s.$.next(s.items);
    };

    s.add = add;
    s.subscribe = (cb) => s.$.subscribe(cb);
    return s
  };

  function noop$1() {}

  function assign(tar, src) {
  	for (const k in src) tar[k] = src[k];
  	return tar;
  }

  function add_location(element, file, line, column, char) {
  	element.__svelte_meta = {
  		loc: { file, line, column, char }
  	};
  }

  function run(fn) {
  	return fn();
  }

  function blank_object() {
  	return Object.create(null);
  }

  function run_all(fns) {
  	fns.forEach(run);
  }

  function is_function(thing) {
  	return typeof thing === 'function';
  }

  function safe_not_equal(a, b) {
  	return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
  }

  function validate_store(store, name) {
  	if (!store || typeof store.subscribe !== 'function') {
  		throw new Error(`'${name}' is not a store with a 'subscribe' method`);
  	}
  }

  function subscribe(component, store, callback) {
  	const unsub = store.subscribe(callback);

  	component.$$.on_destroy.push(unsub.unsubscribe
  		? () => unsub.unsubscribe()
  		: unsub);
  }

  function create_slot(definition, ctx, fn) {
  	if (definition) {
  		const slot_ctx = get_slot_context(definition, ctx, fn);
  		return definition[0](slot_ctx);
  	}
  }

  function get_slot_context(definition, ctx, fn) {
  	return definition[1]
  		? assign({}, assign(ctx.$$scope.ctx, definition[1](fn ? fn(ctx) : {})))
  		: ctx.$$scope.ctx;
  }

  function get_slot_changes(definition, ctx, changed, fn) {
  	return definition[1]
  		? assign({}, assign(ctx.$$scope.changed || {}, definition[1](fn ? fn(changed) : {})))
  		: ctx.$$scope.changed || {};
  }

  function append(target, node) {
  	target.appendChild(node);
  }

  function insert(target, node, anchor) {
  	target.insertBefore(node, anchor);
  }

  function detach(node) {
  	node.parentNode.removeChild(node);
  }

  function destroy_each(iterations, detaching) {
  	for (let i = 0; i < iterations.length; i += 1) {
  		if (iterations[i]) iterations[i].d(detaching);
  	}
  }

  function element(name) {
  	return document.createElement(name);
  }

  function text(data) {
  	return document.createTextNode(data);
  }

  function space() {
  	return text(' ');
  }

  function listen(node, event, handler, options) {
  	node.addEventListener(event, handler, options);
  	return () => node.removeEventListener(event, handler, options);
  }

  function children(element) {
  	return Array.from(element.childNodes);
  }

  function set_data(text, data) {
  	data = '' + data;
  	if (text.data !== data) text.data = data;
  }

  let current_component;

  function set_current_component(component) {
  	current_component = component;
  }

  const dirty_components = [];

  const resolved_promise = Promise.resolve();
  let update_scheduled = false;
  const binding_callbacks = [];
  const render_callbacks = [];
  const flush_callbacks = [];

  function schedule_update() {
  	if (!update_scheduled) {
  		update_scheduled = true;
  		resolved_promise.then(flush);
  	}
  }

  function add_render_callback(fn) {
  	render_callbacks.push(fn);
  }

  function flush() {
  	const seen_callbacks = new Set();

  	do {
  		// first, call beforeUpdate functions
  		// and update components
  		while (dirty_components.length) {
  			const component = dirty_components.shift();
  			set_current_component(component);
  			update(component.$$);
  		}

  		while (binding_callbacks.length) binding_callbacks.shift()();

  		// then, once components are updated, call
  		// afterUpdate functions. This may cause
  		// subsequent updates...
  		while (render_callbacks.length) {
  			const callback = render_callbacks.pop();
  			if (!seen_callbacks.has(callback)) {
  				callback();

  				// ...so guard against infinite loops
  				seen_callbacks.add(callback);
  			}
  		}
  	} while (dirty_components.length);

  	while (flush_callbacks.length) {
  		flush_callbacks.pop()();
  	}

  	update_scheduled = false;
  }

  function update($$) {
  	if ($$.fragment) {
  		$$.update($$.dirty);
  		run_all($$.before_render);
  		$$.fragment.p($$.dirty, $$.ctx);
  		$$.dirty = null;

  		$$.after_render.forEach(add_render_callback);
  	}
  }

  let outros;

  function group_outros() {
  	outros = {
  		remaining: 0,
  		callbacks: []
  	};
  }

  function check_outros() {
  	if (!outros.remaining) {
  		run_all(outros.callbacks);
  	}
  }

  function on_outro(callback) {
  	outros.callbacks.push(callback);
  }

  function mount_component(component, target, anchor) {
  	const { fragment, on_mount, on_destroy, after_render } = component.$$;

  	fragment.m(target, anchor);

  	// onMount happens after the initial afterUpdate. Because
  	// afterUpdate callbacks happen in reverse order (inner first)
  	// we schedule onMount callbacks before afterUpdate callbacks
  	add_render_callback(() => {
  		const new_on_destroy = on_mount.map(run).filter(is_function);
  		if (on_destroy) {
  			on_destroy.push(...new_on_destroy);
  		} else {
  			// Edge case - component was destroyed immediately,
  			// most likely as a result of a binding initialising
  			run_all(new_on_destroy);
  		}
  		component.$$.on_mount = [];
  	});

  	after_render.forEach(add_render_callback);
  }

  function destroy(component, detaching) {
  	if (component.$$) {
  		run_all(component.$$.on_destroy);
  		component.$$.fragment.d(detaching);

  		// TODO null out other refs, including component.$$ (but need to
  		// preserve final state?)
  		component.$$.on_destroy = component.$$.fragment = null;
  		component.$$.ctx = {};
  	}
  }

  function make_dirty(component, key) {
  	if (!component.$$.dirty) {
  		dirty_components.push(component);
  		schedule_update();
  		component.$$.dirty = {};
  	}
  	component.$$.dirty[key] = true;
  }

  function init(component, options, instance, create_fragment, not_equal$$1, prop_names) {
  	const parent_component = current_component;
  	set_current_component(component);

  	const props = options.props || {};

  	const $$ = component.$$ = {
  		fragment: null,
  		ctx: null,

  		// state
  		props: prop_names,
  		update: noop$1,
  		not_equal: not_equal$$1,
  		bound: blank_object(),

  		// lifecycle
  		on_mount: [],
  		on_destroy: [],
  		before_render: [],
  		after_render: [],
  		context: new Map(parent_component ? parent_component.$$.context : []),

  		// everything else
  		callbacks: blank_object(),
  		dirty: null
  	};

  	let ready = false;

  	$$.ctx = instance
  		? instance(component, props, (key, value) => {
  			if ($$.ctx && not_equal$$1($$.ctx[key], $$.ctx[key] = value)) {
  				if ($$.bound[key]) $$.bound[key](value);
  				if (ready) make_dirty(component, key);
  			}
  		})
  		: props;

  	$$.update();
  	ready = true;
  	run_all($$.before_render);
  	$$.fragment = create_fragment($$.ctx);

  	if (options.target) {
  		if (options.hydrate) {
  			$$.fragment.l(children(options.target));
  		} else {
  			$$.fragment.c();
  		}

  		if (options.intro && component.$$.fragment.i) component.$$.fragment.i();
  		mount_component(component, options.target, options.anchor);
  		flush();
  	}

  	set_current_component(parent_component);
  }

  class SvelteComponent {
  	$destroy() {
  		destroy(this, true);
  		this.$destroy = noop$1;
  	}

  	$on(type, callback) {
  		const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
  		callbacks.push(callback);

  		return () => {
  			const index = callbacks.indexOf(callback);
  			if (index !== -1) callbacks.splice(index, 1);
  		};
  	}

  	$set() {
  		// overridden by instance, if it has props
  	}
  }

  class SvelteComponentDev extends SvelteComponent {
  	constructor(options) {
  		if (!options || (!options.target && !options.$$inline)) {
  			throw new Error(`'target' is a required option`);
  		}

  		super();
  	}

  	$destroy() {
  		super.$destroy();
  		this.$destroy = () => {
  			console.warn(`Component was already destroyed`); // eslint-disable-line no-console
  		};
  	}
  }

  /* src/platform/components/Navbar.svelte generated by Svelte v3.1.0 */

  const file = "src/platform/components/Navbar.svelte";

  function create_fragment(ctx) {
  	var nav, current;

  	const default_slot_1 = ctx.$$slots.default;
  	const default_slot = create_slot(default_slot_1, ctx, null);

  	return {
  		c: function create() {
  			nav = element("nav");

  			if (default_slot) default_slot.c();

  			nav.className = "svelte-19iff2v";
  			add_location(nav, file, 12, 0, 177);
  		},

  		l: function claim(nodes) {
  			if (default_slot) default_slot.l(nav_nodes);
  			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
  		},

  		m: function mount(target, anchor) {
  			insert(target, nav, anchor);

  			if (default_slot) {
  				default_slot.m(nav, null);
  			}

  			current = true;
  		},

  		p: function update(changed, ctx) {
  			if (default_slot && default_slot.p && changed.$$scope) {
  				default_slot.p(get_slot_changes(default_slot_1, ctx, changed,), get_slot_context(default_slot_1, ctx, null));
  			}
  		},

  		i: function intro(local) {
  			if (current) return;
  			if (default_slot && default_slot.i) default_slot.i(local);
  			current = true;
  		},

  		o: function outro(local) {
  			if (default_slot && default_slot.o) default_slot.o(local);
  			current = false;
  		},

  		d: function destroy(detaching) {
  			if (detaching) {
  				detach(nav);
  			}

  			if (default_slot) default_slot.d(detaching);
  		}
  	};
  }

  function instance($$self, $$props, $$invalidate) {
  	let { $$slots = {}, $$scope } = $$props;

  	$$self.$set = $$props => {
  		if ('$$scope' in $$props) $$invalidate('$$scope', $$scope = $$props.$$scope);
  	};

  	return { $$slots, $$scope };
  }

  class Navbar extends SvelteComponentDev {
  	constructor(options) {
  		super(options);
  		init(this, options, instance, create_fragment, safe_not_equal, []);
  	}
  }

  /* src/platform/components/Item.svelte generated by Svelte v3.1.0 */

  const file$1 = "src/platform/components/Item.svelte";

  function create_fragment$1(ctx) {
  	var div, t;

  	return {
  		c: function create() {
  			div = element("div");
  			t = text(ctx.title);
  			div.className = "svelte-v0on2j";
  			add_location(div, file$1, 15, 0, 215);
  		},

  		l: function claim(nodes) {
  			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
  		},

  		m: function mount(target, anchor) {
  			insert(target, div, anchor);
  			append(div, t);
  		},

  		p: function update(changed, ctx) {
  			if (changed.title) {
  				set_data(t, ctx.title);
  			}
  		},

  		i: noop$1,
  		o: noop$1,

  		d: function destroy(detaching) {
  			if (detaching) {
  				detach(div);
  			}
  		}
  	};
  }

  function instance$1($$self, $$props, $$invalidate) {
  	let { title } = $$props;

  	$$self.$set = $$props => {
  		if ('title' in $$props) $$invalidate('title', title = $$props.title);
  	};

  	return { title };
  }

  class Item extends SvelteComponentDev {
  	constructor(options) {
  		super(options);
  		init(this, options, instance$1, create_fragment$1, safe_not_equal, ["title"]);

  		const { ctx } = this.$$;
  		const props = options.props || {};
  		if (ctx.title === undefined && !('title' in props)) {
  			console.warn("<Item> was created without expected prop 'title'");
  		}
  	}

  	get title() {
  		throw new Error("<Item>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
  	}

  	set title(value) {
  		throw new Error("<Item>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
  	}
  }

  /* src/app/views/Home.svelte generated by Svelte v3.1.0 */

  const file$2 = "src/app/views/Home.svelte";

  function get_each_context(ctx, list, i) {
  	const child_ctx = Object.create(ctx);
  	child_ctx.item = list[i];
  	return child_ctx;
  }

  // (12:0) <Navbar>
  function create_default_slot(ctx) {
  	var div0, t_1, div1, dispose;

  	return {
  		c: function create() {
  			div0 = element("div");
  			div0.textContent = "Todo Items";
  			t_1 = space();
  			div1 = element("div");
  			div1.textContent = "Add New +";
  			add_location(div0, file$2, 12, 1, 258);
  			add_location(div1, file$2, 13, 1, 281);
  			dispose = listen(div1, "click", ctx.click_handler);
  		},

  		m: function mount(target, anchor) {
  			insert(target, div0, anchor);
  			insert(target, t_1, anchor);
  			insert(target, div1, anchor);
  		},

  		p: noop$1,

  		d: function destroy(detaching) {
  			if (detaching) {
  				detach(div0);
  				detach(t_1);
  				detach(div1);
  			}

  			dispose();
  		}
  	};
  }

  // (21:0) {#each $store as item}
  function create_each_block(ctx) {
  	var current;

  	var item_1 = new Item({
  		props: { title: ctx.item.title },
  		$$inline: true
  	});

  	return {
  		c: function create() {
  			item_1.$$.fragment.c();
  		},

  		m: function mount(target, anchor) {
  			mount_component(item_1, target, anchor);
  			current = true;
  		},

  		p: function update(changed, ctx) {
  			var item_1_changes = {};
  			if (changed.$store) item_1_changes.title = ctx.item.title;
  			item_1.$set(item_1_changes);
  		},

  		i: function intro(local) {
  			if (current) return;
  			item_1.$$.fragment.i(local);

  			current = true;
  		},

  		o: function outro(local) {
  			item_1.$$.fragment.o(local);
  			current = false;
  		},

  		d: function destroy(detaching) {
  			item_1.$destroy(detaching);
  		}
  	};
  }

  function create_fragment$2(ctx) {
  	var t, main, current;

  	var navbar = new Navbar({
  		props: {
  		$$slots: { default: [create_default_slot] },
  		$$scope: { ctx }
  	},
  		$$inline: true
  	});

  	var each_value = ctx.$store;

  	var each_blocks = [];

  	for (var i = 0; i < each_value.length; i += 1) {
  		each_blocks[i] = create_each_block(get_each_context(ctx, each_value, i));
  	}

  	function outro_block(i, detaching, local) {
  		if (each_blocks[i]) {
  			if (detaching) {
  				on_outro(() => {
  					each_blocks[i].d(detaching);
  					each_blocks[i] = null;
  				});
  			}

  			each_blocks[i].o(local);
  		}
  	}

  	return {
  		c: function create() {
  			navbar.$$.fragment.c();
  			t = space();
  			main = element("main");

  			for (var i = 0; i < each_blocks.length; i += 1) {
  				each_blocks[i].c();
  			}
  			add_location(main, file$2, 19, 0, 361);
  		},

  		l: function claim(nodes) {
  			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
  		},

  		m: function mount(target, anchor) {
  			mount_component(navbar, target, anchor);
  			insert(target, t, anchor);
  			insert(target, main, anchor);

  			for (var i = 0; i < each_blocks.length; i += 1) {
  				each_blocks[i].m(main, null);
  			}

  			current = true;
  		},

  		p: function update(changed, ctx) {
  			var navbar_changes = {};
  			if (changed.$$scope) navbar_changes.$$scope = { changed, ctx };
  			navbar.$set(navbar_changes);

  			if (changed.$store) {
  				each_value = ctx.$store;

  				for (var i = 0; i < each_value.length; i += 1) {
  					const child_ctx = get_each_context(ctx, each_value, i);

  					if (each_blocks[i]) {
  						each_blocks[i].p(changed, child_ctx);
  						each_blocks[i].i(1);
  					} else {
  						each_blocks[i] = create_each_block(child_ctx);
  						each_blocks[i].c();
  						each_blocks[i].i(1);
  						each_blocks[i].m(main, null);
  					}
  				}

  				group_outros();
  				for (; i < each_blocks.length; i += 1) outro_block(i, 1, 1);
  				check_outros();
  			}
  		},

  		i: function intro(local) {
  			if (current) return;
  			navbar.$$.fragment.i(local);

  			for (var i = 0; i < each_value.length; i += 1) each_blocks[i].i();

  			current = true;
  		},

  		o: function outro(local) {
  			navbar.$$.fragment.o(local);

  			each_blocks = each_blocks.filter(Boolean);
  			for (let i = 0; i < each_blocks.length; i += 1) outro_block(i, 0);

  			current = false;
  		},

  		d: function destroy(detaching) {
  			navbar.$destroy(detaching);

  			if (detaching) {
  				detach(t);
  				detach(main);
  			}

  			destroy_each(each_blocks, detaching);
  		}
  	};
  }

  function instance$2($$self, $$props, $$invalidate) {
  	let $store;

  	
  	
  	let { router, items } = $$props;

  	const store = items.$; validate_store(store, 'store'); subscribe($$self, store, $$value => { $store = $$value; $$invalidate('$store', $store); });

  	function click_handler() {
  		return router.navigate('/add');
  	}

  	$$self.$set = $$props => {
  		if ('router' in $$props) $$invalidate('router', router = $$props.router);
  		if ('items' in $$props) $$invalidate('items', items = $$props.items);
  	};

  	return {
  		router,
  		items,
  		store,
  		$store,
  		click_handler
  	};
  }

  class Home extends SvelteComponentDev {
  	constructor(options) {
  		super(options);
  		init(this, options, instance$2, create_fragment$2, safe_not_equal, ["router", "items"]);

  		const { ctx } = this.$$;
  		const props = options.props || {};
  		if (ctx.router === undefined && !('router' in props)) {
  			console.warn("<Home> was created without expected prop 'router'");
  		}
  		if (ctx.items === undefined && !('items' in props)) {
  			console.warn("<Home> was created without expected prop 'items'");
  		}
  	}

  	get router() {
  		throw new Error("<Home>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
  	}

  	set router(value) {
  		throw new Error("<Home>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
  	}

  	get items() {
  		throw new Error("<Home>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
  	}

  	set items(value) {
  		throw new Error("<Home>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
  	}
  }

  void async function main() {
  	const items = createStore();
  	const r = create();

  	r.path('/', { 
  		redirectTo: '/home'
  	});

  	r.path('/home', { 
  		component: () => Home,
  		require: { 
  			router: r ,
  			items
  		}
  	});

  	r.path('/add', { 
  		component: () => window.AppAdd,
  		require: { 
  			router: r,
  			items
  		},
  		load: ['/add/add.js', '/add/add.css']
  	});

  	r.init();

  	items.subscribe(console.log);
  }();

}());
//# sourceMappingURL=bundle.js.map
