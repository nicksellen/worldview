"use strict";

var _createClass = (function () { function defineProperties(target, props) { for (var key in props) { var prop = props[key]; prop.configurable = true; if (prop.value) prop.writable = true; } Object.defineProperties(target, props); } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

var _classCallCheck = function (instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } };

var World = (function () {
  function World() {
    _classCallCheck(this, World);

    this.STATE = {};
    this.pendingUpdates = [];
    this.updating = false;
    this.scheduled = false;
    this.listeners = {};
    this.pathValues = {};
    this.afters = [];
  }

  _createClass(World, {
    scheduleUpdate: {
      value: function scheduleUpdate(fn) {
        this.pendingUpdates.push(fn);
        if (!this.scheduled) {
          this.scheduled = true;
          schedule(this.applyUpdates.bind(this));
        }
      }
    },
    applyUpdates: {
      value: function applyUpdates() {
        var _this = this;

        this.scheduled = false;
        this.updating = true;
        try {
          if (this.pendingUpdates.length > 0) {
            var updates = this.pendingUpdates;
            this.pendingUpdates = [];
            var NEXT_STATE = this.STATE;

            updates.forEach(function (fn) {
              NEXT_STATE = fn(NEXT_STATE);
            });

            if (NEXT_STATE === undefined) {
              NEXT_STATE = {};
            }

            if (NEXT_STATE !== this.STATE) {
              var PREVIOUS_STATE = this.STATE;
              this.STATE = NEXT_STATE;
              triggerListeners(PREVIOUS_STATE, this.STATE, this.listeners);
              this.afters.forEach(function (fn) {
                return fn(_this.STATE);
              });
            }
          }
        } finally {
          this.updating = false;
        }
      }
    },
    addPathListener: {
      value: function addPathListener(path, fn) {
        var _this = this;

        pushInTree(this.listeners, path, "$$", fn);
        var unlisten = function () {
          removeInTree(_this.listeners, path, "$$", fn);
        };
        fn.$$unlisten = unlisten;
        return unlisten;
      }
    },
    after: {
      value: function after(fn, sendInitial) {
        var _this = this;

        this.afters.push(fn);
        if (sendInitial) {
          fn(this.STATE);
        }
        return function () {
          var idx = _this.afters.indexOf(fn);
          if (idx === -1) return;
          _this.afters.splice(idx, 1);
        };
      }
    }
  });

  return World;
})();

function createWorldView(root, path) {

  path = ensurePath(path);

  function get(subpath) {
    if (subpath) {
      return getIn(root.STATE, path.concat(ensurePath(subpath)));
    } else {
      return getIn(root.STATE, path);
    }
  }

  function updateValue(updatePath, newValue) {
    if (typeof newValue === "function") {
      var fn = newValue;
      if (fn.length === 0) {
        root.scheduleUpdate(function (state) {
          return setIn(state, updatePath, fn());
        });
      } else {
        // wants the previous value passed
        root.scheduleUpdate(function (state) {
          var stateValue = getIn(state, updatePath);
          var newValue = fn(stateValue);
          if (newValue !== stateValue) {
            return setIn(state, updatePath, newValue);
          }
          return state;
        });
      }
    } else {
      root.scheduleUpdate(function (state) {
        return setIn(state, updatePath, newValue);
      });
    }
  }

  merge(get, {

    at: function at(subpath) {
      return createWorldView(root, path.concat(ensurePath(subpath)));
    },

    get: (function (_get) {
      var _getWrapper = function get() {
        return _get.apply(this, arguments);
      };

      _getWrapper.toString = function () {
        return _get.toString();
      };

      return _getWrapper;
    })(function () {
      return get.apply(this, arguments);
    }),

    update: function update() {
      if (arguments.length === 1) {
        var newValue = arguments[0];
        updateValue(path, newValue);
      } else if (arguments.length === 2) {
        var extraPath = ensurePath(arguments[0]);
        var newValue = arguments[1];
        updateValue(path.concat(extraPath), newValue);
      } else {
        throw "try update(value) or update(path, value)";
      }
    },

    clear: function clear() {
      if (arguments.length === 0) {
        updateValue(path, undefined);
      } else if (arguments.length === 1) {
        var extraPath = ensurePath(arguments[0]);
        updateValue(path.concat(extraPath), undefined);
      }
    },

    listen: function listen() {
      if (arguments.length === 1) {
        var fn = arguments[0];
        return root.addPathListener(path, fn);
      } else if (arguments.length === 2) {
        var extraPath = ensurePath(arguments[0]);
        var fn = arguments[1];
        return root.addPathListener(path.concat(extraPath), fn);
      } else {
        throw "try listen(fn) or listen(path, fn)";
      }
    },

    after: function after(fn) {
      return root.after(fn);
    }

  });

  return get;
}

var schedule = findScheduler();

var DEFAULT_WORLD = new World();

module.exports = createWorldView(DEFAULT_WORLD, []);

function findScheduler() {
  var scheduler;
  if (typeof window !== "undefined") {
    scheduler = window.requestAnimationFrame || window.webkitRequestAnimationFrame || window.mozRequestAnimationFrame;
  }
  if (scheduler) {
    return scheduler;
  } else if (typeof setImmediate === "function") {
    return setImmediate;
  } else {
    return function (fn) {
      setTimeout(fn, 0);
    };
  }
}

function ensurePath(path, copy) {
  if (!path) {
    return [];
  }if (typeof path === "string") {
    return path.split(".").filter(function (v) {
      return v;
    });
  } else if (copy) {
    return path.slice();
  } else {
    return path;
  }
}

function getIn(_x, _x2, _x3) {
  var _again = true;

  _function: while (_again) {
    _again = false;
    var obj = _x,
        path = _x2,
        checkedPath = _x3;

    if (obj === undefined) {
      return;
    }if (!checkedPath) path = ensurePath(path, true);
    if (path.length === 0) {
      return obj;
    }if (obj instanceof Object) {
      _x = obj[path.shift()];
      _x2 = path;
      _x3 = true;
      _again = true;
      continue _function;
    }
  }
}

function setIn(obj, path, val, checkedPath) {
  if (!checkedPath) path = ensurePath(path, true);
  if (path.length === 0) {
    return val;
  }if (path.length === 1) {
    var k = path.shift();
    if (val !== obj[k]) {
      obj = copy(obj);
      if (val === undefined) {
        delete obj[k];
      } else {
        obj[k] = val;
      }
    }
  } else {
    var k = path.shift();
    var nextObj = obj.hasOwnProperty(k) ? obj[k] : {};
    var updatedNextObj = setIn(nextObj, path, val, true);
    if (updatedNextObj !== nextObj) {
      obj = copy(obj);
      obj[k] = updatedNextObj;
    }
  }
  return obj;
}

function ensureObjAt(_x, _x2, _x3) {
  var _again = true;

  _function: while (_again) {
    _again = false;
    var obj = _x,
        path = _x2,
        checkedPath = _x3;
    k = nextObj = undefined;

    if (!checkedPath) path = ensurePath(path, true);
    if (path.length === 0) {
      return obj;
    }var k = path.shift();
    var nextObj = obj[k];
    if (typeof nextObj !== "object") {
      nextObj = {};
      obj[k] = nextObj;
    }
    if (path.length === 0) {
      return nextObj;
    } else {
      _x = nextObj;
      _x2 = path;
      _x3 = true;
      _again = true;
      continue _function;
    }
  }
}

function pushInTree(obj, path, key, val) {
  var obj = ensureObjAt(obj, path);
  if (!obj.hasOwnProperty(key)) {
    obj[key] = [];
  }
  obj[key].push(val);
}

function removeInTree(obj, path, key, val, checkedPath) {
  if (typeof obj !== "object") {
    return;
  }if (!checkedPath) path = ensurePath(path, true);
  if (path.length === 0) {
    if (obj.hasOwnProperty(key)) {
      var idx = obj[key].indexOf(val);
      if (idx === -1) {
        return;
      }var ary = obj[key];
      ary.splice(idx, 1);
      if (ary.length === 0) {
        delete obj[key];
        return true;
      }
    }
  };
  var k = path.shift();
  if (removeInTree(obj[k], path, key, val, true)) {
    delete obj[k];
    return Object.keys(obj).length === 0;
  }
  return false;
}

function triggerListeners(previous, current, listeners, path) {
  if (!path) path = [];
  if (current !== previous) {
    var currentIsObject = typeof current === "object";
    var previousIsObject = typeof previous === "object";
    if (listeners.hasOwnProperty("$$")) {
      listeners.$$.forEach(function (fn) {
        fn(current, previous, fn.$$unlisten);
      });
    }
    Object.keys(listeners).forEach(function (k) {
      triggerListeners(previousIsObject ? previous[k] : undefined, currentIsObject ? current[k] : undefined, listeners[k], path.concat([k]));
    });
  }
}

function merge(destination) {
  if (!destination) destination = {};
  for (var i = 1; i < arguments.length; i++) {
    var source = arguments[i];
    if (source) {
      Object.keys(source).forEach(function (k) {
        destination[k] = source[k];
      });
    }
  }
  return destination;
}

function copy(source) {
  if (typeof source !== "object") {
    return {};
  }var destination = {};
  Object.keys(source).forEach(function (k) {
    destination[k] = source[k];
  });
  return destination;
}