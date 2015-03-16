
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
    this.afterCommitFns = [];
  }

  scheduleUpdate(fn) {
    this.pendingUpdates.push(fn);
    if (!this.scheduled) {
      this.scheduled = true;
      schedule(this.applyUpdates.bind(this));
    }
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
          var PREVIOUS_STATE = this.STATE;
          this.STATE = NEXT_STATE;
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
    var unlisten = () => {
      removeInTree(list, path, '$$', fn);
    };
    fn.$$unlisten = unlisten;
    return unlisten;
  }

}

function createReadOnlyView(root, path) {

  path = ensurePath(path);

  function get(subpath){
    if (subpath) {
      return getIn(root.STATE, path.concat(ensurePath(subpath)));
    } else {
      return getIn(root.STATE, path);
    }
  }

  function addListener(args, type) {
    if (args.length === 1) {
      var fn = args[0];
      return root.addListener(path, fn, type);
    } else if (args.length === 2) {
      var extraPath = ensurePath(args[0]);
      var fn = args[1];
      return root.addListener(path.concat(extraPath), fn, type);
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

    $root: root,
    get: get,
    listen: listen,

    at(subpath){
      return createReadOnlyView(root, path.concat(ensurePath(subpath)));
    },

    derive(fn) {
      return createDerivedView(this, fn);
    }

  });

  return get;
}

function createWritableView(root, path) {

  var view = createReadOnlyView(root, path);

  function updateValue(updatePath, updateValue) {
    if (typeof updateValue === 'function') {
      var fn = updateValue;
      if (fn.length === 0) {
        root.scheduleUpdate(state => updateIn(state, updatePath, fn()));
      } else {
        // the fn wants the previous state value passed in
        root.scheduleUpdate(state => {
          var stateValue = getIn(state, updatePath);
          var updateValue = fn(stateValue);
          if (updateValue !== stateValue) {
            return updateIn(state, updatePath, updateValue); 
          }
          return state;
        });
      }
    } else {
      root.scheduleUpdate(state => updateIn(state, updatePath, updateValue));
    }
  }

  merge(view,{
    
    update() {
      if (arguments.length === 1) {
        var updateValue = arguments[0];
        updateValue(path, updateValue);
      } else if (arguments.length === 2) {
        var extraPath = ensurePath(arguments[0]);
        var updateValue = arguments[1];
        updateValue(path.concat(extraPath), updateValue);
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
      return createWritableView(root, path.concat(ensurePath(subpath)));
    }

  });

  return view;
}

function createDerivedView(view, fn) {

  var root = view.$root;

  var currentValue;
  var preCommitListeners = [];
  var postCommitListeners = [];

  update(view());
  view.listen.pre(update);

  function get() {
    return currentValue;
  }

  function update(value) {
    var updatedValue = fn(value);
    preCommitListeners.forEach(fn => fn(updatedValue));
    currentValue = updatedValue;
    root.afterCommit(() => {
      postCommitListeners.forEach(fn => fn(updatedValue));
    });
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

    $root: root,
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

export default createWritableView(DEFAULT_WORLD, []);

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
  if (obj === undefined) return;
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
      if (listRemove(obj[key], val) === LIST_EMPTY)) {
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
      }
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