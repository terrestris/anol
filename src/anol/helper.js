/**
 * @module Helper
 */

const helper = {

    /**
     * Returns v or d if v undefined
     */
    getValue(v, d) {
        return angular.isUndefined(v) ? d : v;
    },
    /**
     * Returns a without elements of b
     */
    excludeList(a, b) {
        var r = a.filter(function(e) {
            return b.indexOf(e) < 0;
        });
        return r;
    },
    /**
     * Returns true when all elements of b in a otherwise false
     */
    allInList(a, b) {
        if(b.length === 0) {
            return false;
        }
        for(var i = 0; i < b.length; i++) {
            if(a.indexOf(b[i]) < 0) {
                return false;
            }
        }
        return true;
    },
    /**
     * Returns distinct list of a and b
     */
    concatDistinct(a, b) {
        var r = a.slice();
        for(var i = 0; i < b.length; i++) {
            if(r.indexOf(b[i]) < 0) {
                r.push(b[i]);
            }
        }
        return r;
    },
    /**
     * Inserts content of array by into array a starting at position at.
     * When at is undefined, append b to a
     */
    concat(a, b, at) {
        if(angular.isDefined(at)) {
            a.splice.apply(a, [at, 0].concat(b));
        } else {
            a = a.concat(b);
        }
        return a;
    },
    /**
     * Returns string splitted into parts but prevents list with empty string
     */
    stringSplit(v, s) {
        var r = v.split(s);
        if(r.length === 1 && r[0] === '') {
            return [];
        }
        return r;
    },
    mergeObjects(a, b) {
        var keys = Object.keys(b || {});
        for(var i = 0; i < keys.length; i++) {
            var key  = keys[i];
            if(angular.isUndefined(a[key])) {
                a[key] = b[key];
                continue;
            }
            if(a[key] instanceof Array) {
                a[key] = anol.helper.concat(a[key], b[key]);
                continue;
            }
            if(a[key] instanceof Object) {
                a[key] = anol.helper.mergeObjects(a[key], b[key]);
                continue;
            }
            a[key] = b[key];
        }
        return a;
    },

    array_move(arr, old_index, new_index) {
        if (old_index === new_index) {
            return arr;
        }
        if (new_index >= arr.length) {
            console.warn('Adding undefined to array. Maybe you are calling this too early in the life cycle?');
            var k = new_index - arr.length + 1;
            while (k--) {
                arr.push(undefined);
            }
        }
        arr.splice(new_index, 0, arr.splice(old_index, 1)[0]);
        return arr; // for testing
    },

    uniq(a) {
        var r = [];
        a.forEach(function(item) {
             if(r.indexOf(item) < 0) {
                 r.push(item);
             }
        });
        return r;
    },

    round(value, decimals) {
        return Number(Math.round(value+'e'+decimals)+'e-'+decimals);
    }

}

export default helper;
