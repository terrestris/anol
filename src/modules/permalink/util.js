/**
 * @param {string} param
 * @param {Object<string[]|string>} params
 * @param {boolean} multi
 * @return {string|string[]}
 */
export function getParamString(param, params, multi = false) {
    if (angular.isUndefined(params[param])) {
        return '';
    }
    var p = params[param];
    if (angular.isArray(p) && !multi) {
        return p[p.length - 1];
    } else if (multi && !angular.isArray(p)) {
        return [p];
    } else {
        return p;
    }
}

export function getArrayParam(param, params) {
    const paramString = getParamString(param, params);
    if (paramString !== false && paramString !== '') {
        return paramString.split(',');
    }
}

function parseObject(paramString) {
    if (paramString !== false && paramString !== '') {
        const result = {};
        for (const [key, value] of paramString.split('|').map(value => value.split(':'))) {
            result[key] = value;
        }
        return result;
    }
}

export function getObjectParam(param, params, multi = false) {
    if (!multi) {
        return parseObject(getParamString(param, params, multi));
    } else {
        return getParamString(param, params, multi).map(parseObject);
    }
}

export function stringifyObject(object) {
    return Object.keys(object)
        .map(k => `${k}:${encodeURIComponent(object[k])}`)
        .join('|');
}
