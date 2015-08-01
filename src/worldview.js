
const PRE_COMMIT = new Object();
const POST_COMMIT = new Object();
const LIST_EMPTY = new Object();

class World {

  constructor() {
    this.STATE = {};
    this.pendingUpdates = [];
    this.updating = false;
    this.scheduled =  false;
    this.preCommitListeners = {};
    this.postCommitListeners = {};
    this.beforeCommitFns = [];
    this.afterCommitFns = [];
  }

  scheduleUpdate(fn) {
    this.pendingUpdates.push(fn);
    if (!this.scheduled) {
      this.scheduled = true;
      schedule(this.applyUpdates.bind(this));
    }
  }

  beforeCommit(fn) {
    this.beforeCommitFns.push(fn);
  }

  afterCommit(fn) {
    this.afterCommitFns.push(fn);
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

          triggerListeners(this.STATE, NEXT_STATE, this.preCommitListeners);

          if (this.beforeCommitFns.length > 0) {
            var fns = this.beforeCommitFns;
            this.beforeCommitFns = [];
            fns.forEach(fn => fn(NEXT_STATE));
          }

          var PREVIOUS_STATE = this.STATE;
          this.STATE = NEXT_STATE; // commit!

          triggerListeners(PREVIOUS_STATE, this.STATE, this.postCommitListeners);

          if (this.afterCommitFns.length > 0) {
            var fns = this.afterCommitFns;
            this.afterCommitFns = [];
            fns.forEach(fn => fn(this.STATE));
          }

        }

      }
    } finally {
      this.updating = false;
    }  
  }

  addListener(path, fn, type) {
    var list = type === PRE_COMMIT ? this.preCommitListeners : this.postCommitListeners;
    pushInTree(list, path, '$$', fn);
    function unlisten() {
      removeInTree(list, path, '$$', fn);
    };
    fn.$$unlisten = unlisten;
    return unlisten;
  }

}

function createReadOnlyView(world, path) {

  path = ensurePath(path);

  function get(subpath){
    if (subpath) {
      return getIn(world.STATE, path.concat(ensurePath(subpath)));
    } else {
      return getIn(world.STATE, path);
    }
  }

  function addListener(args, type) {
    if (args.length === 1) {
      var fn = args[0];
      return world.addListener(path, fn, type);
    } else if (args.length === 2) {
      var extraPath = ensurePath(args[0]);
      var fn = args[1];
      return world.addListener(path.concat(extraPath), fn, type);
    } else {
      throw 'this accepts 1 or 2 arguments, not ' + arguments.length;
    }
  }

  function listen() {
    return addListener(arguments, POST_COMMIT);
  }

  listen.pre = function(){
    return addListener(arguments, PRE_COMMIT);
  };

  merge(get, {

    $world: world,
    get: get,
    listen: listen,

    at(subpath){
      return createReadOnlyView(world, path.concat(ensurePath(subpath)));
    },

    derive(fn) {
      return createDerivedView(this, fn);
    }

  });

  return get;
}

function createWritableView(world, path) {

  var view = createReadOnlyView(world, path);

  function updateValue(updatePath, updatedValue) {
    if (typeof updatedValue === 'function') {
      var fn = updatedValue;
      if (fn.length === 0) {
        world.scheduleUpdate(state => updateIn(state, updatePath, fn()));
      } else {
        // the fn wants the previous state value passed in
        world.scheduleUpdate(state => {
          var stateValue = getIn(state, updatePath);
          var updatedValue = fn(stateValue);
          if (updatedValue !== stateValue) {
            return updateIn(state, updatePath, updatedValue); 
          }
          return state;
        });
      }
    } else {
      world.scheduleUpdate(state => updateIn(state, updatePath, updatedValue));
    }
  }

  merge(view,{
    
    update() {
      if (arguments.length === 1) {
        var updatedValue = arguments[0];
        updateValue(path, updatedValue);
      } else if (arguments.length === 2) {
        var extraPath = ensurePath(arguments[0]);
        var updatedValue = arguments[1];
        updateValue(path.concat(extraPath), updatedValue);
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
      } else {
        throw 'try clear() or clear(path)'
      }
    },

    writableAt(subpath){
      return createWritableView(world, path.concat(ensurePath(subpath)));
    }

  });

  return view;
}

function createCompoundView(world, specs) {

  var preCommitListeners = [];
  var postCommitListeners = [];

  var updated = false;

  var keys = Object.keys(specs);

  var values = {};

  keys.forEach(k => {
    values[k] = undefined;
  });

  var oldValues;

  var i = 0;
  keys.forEach(k => {
    var view = specs[k];

    values[k] = view(); // initial value

    view.listen.pre(val => {

      if (!updated && values[k] !== val) {

        // ok, at least one of the things updated...

        updated = true;

        oldValues = values;
        values = copy(values);

        if (preCommitListeners.length > 0) {
          world.beforeCommit(() => {
            preCommitListeners.forEach(fn => {
              fn(values, oldValues, fn.$$unlisten);
            });  
          });
        }

        world.afterCommit(() => {
          updated = false;
          postCommitListeners.forEach(fn => {
            fn(values, oldValues, fn.$$unlisten);
          });
        });

      }

      values[k] = val;

    });

  });

  function get() {
    return values;
  }

  function listen(fn) {
    postCommitListeners.push(fn);
    function unlisten() {
      listRemove(postCommitListeners, fn);
    }
    fn.$$unlisten = unlisten;
    return unlisten;
  }

  listen.pre = fn => {
    preCommitListeners.push(fn);
    function unlisten() {
      listRemove(preCommitListeners, fn);
    }
    fn.$$unlisten = unlisten;
    return unlisten;
  };

  merge(get,{
    $world: world,
    get: get,
    listen: listen,

    derive(fn) {
      return createDerivedView(get, fn);
    }

  });

  return get;

}

function createDerivedView(view, fn) {

  var world = view.$world;

  var currentValue = undefined;
  var previousValue = undefined;
  var updatedValue = undefined;

  var setAfterCommit = false;

  var preCommitListeners = [];
  var postCommitListeners = [];

  var v = view();
  if (v !== undefined) {
    update(v);
  }
  view.listen.pre(update);

  function get() {
    return currentValue;
  }

  function update(value) {

    // as this gets called in pre commit, it can be called
    // multiple times within one commit transaction...
    // hence needing to store these update values outside
    // the fn

    updatedValue = fn(value);

    if (updatedValue === currentValue) return;

    preCommitListeners.forEach(fn => {
      fn(updatedValue, previousValue);
    });
    
    previousValue = currentValue;
    currentValue = updatedValue;

    if (!setAfterCommit) {
      setAfterCommit = true;
      world.afterCommit(() => {
        postCommitListeners.forEach(fn => fn(updatedValue, previousValue));
        updatedValue = undefined;
        setAfterCommit = false;
      });
    }

  }

  function addListener(fn, type) {
    var list = type === PRE_COMMIT ? preCommitListeners : postCommitListeners;
    list.push(fn);
    return () => {
      listRemove(list, fn);
    };
  }

  function listen(fn) {
    return addListener(fn, POST_COMMIT);
  }

  listen.pre = fn => addListener(fn, PRE_COMMIT);

  merge(get, {

    $world: world,
    get: get,
    listen: listen,

    derive(fn) {
      return createDerivedView(get, fn);
    }

  });

  return get;
}

const schedule = findScheduler();

const DEFAULT_WORLD = new World();

function createRoot(world) {
  var root = createWritableView(world, []);
  root.compound = function(specs){

    Object.keys(specs).forEach(k => {
      var view = specs[k];
      if (typeof view === 'string') {
        specs[k] = createReadOnlyView(world, view);
      }
    });

    return createCompoundView(world, specs);

  };
  root.createWorld = function(){
    return createRoot(new World());
  };
  return root;
}

export default createRoot(DEFAULT_WORLD);

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

function listRemove(list, item) {
  var idx = list.indexOf(item);
  if (idx === -1) return;
  list.splice(idx, 1);
  if (list.length === 0) return LIST_EMPTY;
}

function getIn(obj, path, checkedPath) {
  if (obj === undefined) return undefined;
  if (!checkedPath) path = ensurePath(path, true);
  if (path.length === 0) return obj;
  if (obj instanceof Object) {
    return getIn(obj[path.shift()], path, true);
  }
}

function updateIn(obj, path, val, checkedPath) {
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
    var updatedNextObj = updateIn(nextObj, path, val, true);
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
      if (listRemove(obj[key], val) === LIST_EMPTY) {
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
  if (!listeners) return;
  if (!path) path = [];
  if (current !== previous) {
    if (listeners.hasOwnProperty('$$')) {
      listeners.$$.forEach(fn => {
        fn(current, previous, fn.$$unlisten);
      });
    }
    var keys = Object.keys(listeners);
    if (keys.length > 0) {
      var currentIsObject = typeof current === 'object';
      var previousIsObject = typeof previous === 'object';
      keys.forEach(k => {
        triggerListeners(previousIsObject ? previous[k] : undefined,
                         currentIsObject ? current[k] : undefined,
                         listeners[k],
                         path.concat([k]));
      });
    }
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