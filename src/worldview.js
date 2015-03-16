
class World {

  constructor() {
    this.STATE = {};
    this.pendingUpdates = [];
    this.updating = false;
    this.scheduled =  false;
    this.listeners = {};
    this.pathValues = {};
    this.afters = [];
  }

  scheduleUpdate(fn) {
    this.pendingUpdates.push(fn);
    if (!this.scheduled) {
      this.scheduled = true;
      schedule(this.applyUpdates.bind(this));
    }
  }

  applyUpdates() {
    this.scheduled = false;
    this.updating = true;
    try {
      if (this.pendingUpdates.length > 0) {
        var updates = this.pendingUpdates;
        this.pendingUpdates = [];
        var NEXT_STATE = this.STATE;

        updates.forEach(fn => {
          NEXT_STATE = fn(NEXT_STATE);
        });

        if (NEXT_STATE === undefined) {
          NEXT_STATE = {};
        }

        if (NEXT_STATE !== this.STATE) {
          var PREVIOUS_STATE = this.STATE;
          this.STATE = NEXT_STATE;
          triggerListeners(PREVIOUS_STATE, this.STATE, this.listeners);
          this.afters.forEach(fn => fn(this.STATE));
        }

      }
    } finally {
      this.updating = false;
    }  
  }

  addPathListener(path, fn) {
    pushInTree(this.listeners, path, '$$', fn);
    var unlisten = () => {
      removeInTree(this.listeners, path, '$$', fn);
    };
    fn.$$unlisten = unlisten;
    return unlisten;
  }

  after(fn, sendInitial) {
    this.afters.push(fn);
    if (sendInitial) {
      fn(this.STATE);
    }
    return () => {
      var idx = this.afters.indexOf(fn);
      if (idx === -1) return;
      this.afters.splice(idx, 1);
    };
  }

}

function createWorldView(root, path) {

  path = ensurePath(path);

  function get(subpath){
    if (subpath) {
      return getIn(root.STATE, path.concat(ensurePath(subpath)));
    } else {
      return getIn(root.STATE, path);
    }
  }

  function updateValue(updatePath, newValue) {
    if (typeof newValue === 'function') {
      var fn = newValue;
      if (fn.length === 0) {
        root.scheduleUpdate(state => setIn(state, updatePath, fn()));
      } else {
        // wants the previous value passed
        root.scheduleUpdate(state => {
          var stateValue = getIn(state, updatePath);
          var newValue = fn(stateValue);
          if (newValue !== stateValue) {
            return setIn(state, updatePath, newValue); 
          }
          return state;
        });
      }
    } else {
      root.scheduleUpdate(state => setIn(state, updatePath, newValue));
    }
  }

  merge(get, {

    at(subpath){
      return createWorldView(root, path.concat(ensurePath(subpath)));
    },

    get() {
      return get.apply(this, arguments);
    },
    
    update() {
      if (arguments.length === 1) {
        var newValue = arguments[0];
        updateValue(path, newValue);
      } else if (arguments.length === 2) {
        var extraPath = ensurePath(arguments[0]);
        var newValue = arguments[1];
        updateValue(path.concat(extraPath), newValue);
      } else {
        throw 'try update(value) or update(path, value)';
      }
    },

    clear() {
      if (arguments.length === 0) {
        updateValue(path, undefined);
      } else if (arguments.length === 1) {
        var extraPath = ensurePath(arguments[0]);
        updateValue(path.concat(extraPath), undefined);
      }
    },

    listen() {
      if (arguments.length === 1) {
        var fn = arguments[0];
        return root.addPathListener(path, fn);
      } else if (arguments.length === 2) {
        var extraPath = ensurePath(arguments[0]);
        var fn = arguments[1];
        return root.addPathListener(path.concat(extraPath), fn);
      } else {
        throw 'try listen(fn) or listen(path, fn)';
      }
    },

    after(fn) {
      return root.after(fn);
    } 

  });

  return get;
}

const schedule = findScheduler();

const DEFAULT_WORLD = new World();

export default createWorldView(DEFAULT_WORLD, []);

function findScheduler() {
  var scheduler;
  if (typeof window !== 'undefined') {
    scheduler = window.requestAnimationFrame || 
                window.webkitRequestAnimationFrame || 
                window.mozRequestAnimationFrame; 
  }
  if (scheduler) {
    return scheduler;
  } else if (typeof setImmediate === 'function') {
    return setImmediate;
  } else {
    return fn => {
      setTimeout(fn, 0);
    };
  }
}

function ensurePath(path, copy) {
  if (!path) return [];
  if (typeof path === 'string') {
    return path.split('.').filter(v => v);
  } else if (copy) {
    return path.slice();
  } else {
    return path;
  }
}

function getIn(obj, path, checkedPath) {
  if (obj === undefined) return;
  if (!checkedPath) path = ensurePath(path, true);
  if (path.length === 0) return obj;
  if (obj instanceof Object) {
    return getIn(obj[path.shift()], path, true);
  }
}

function setIn(obj, path, val, checkedPath) {
  if (!checkedPath) path = ensurePath(path, true);
  if (path.length === 0) return val;
  if (path.length === 1) {
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

function ensureObjAt(obj, path, checkedPath) {
  if (!checkedPath) path = ensurePath(path, true);
  if (path.length === 0) return obj;
  var k = path.shift();
  var nextObj = obj[k];
  if (typeof nextObj !== 'object') {
    nextObj = {};
    obj[k] = nextObj;
  }
  if (path.length === 0) {
    return nextObj;
  } else {
    return ensureObjAt(nextObj, path, true);
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
  if (typeof obj !== 'object') return;
  if (!checkedPath) path = ensurePath(path, true);
  if (path.length === 0) {
    if (obj.hasOwnProperty(key)) {
      var idx = obj[key].indexOf(val);
      if (idx === -1) return;
      var ary = obj[key];
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
    var currentIsObject = typeof current === 'object';
    var previousIsObject = typeof previous === 'object';
    if (listeners.hasOwnProperty('$$')) {
      listeners.$$.forEach(fn => {
        fn(current, previous, fn.$$unlisten);
      });
    }
    Object.keys(listeners).forEach(k => {
      triggerListeners(previousIsObject ? previous[k] : undefined,
                       currentIsObject ? current[k] : undefined,
                       listeners[k],
                       path.concat([k]));
    });
  }
}

function merge(destination) {
  if (!destination) destination = {};
  for (var i = 1; i < arguments.length; i++) {
    var source = arguments[i];
    if (source) {
      Object.keys(source).forEach(k => {
        destination[k] = source[k];
      });
    }
  }
  return destination;
}

function copy(source) {
  if (typeof source !== 'object') return {};
  var destination = {};
  Object.keys(source).forEach(k => {
    destination[k] = source[k];
  });
  return destination;
}