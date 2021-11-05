/**
 * @typedef {Record<string, string|string[]|undefined>} UrlParams
 */

/**
 * @param {string} param
 * @param {UrlParams} params
 * @return {string|undefined}
 */
export function getStringParam(param, params) {
    const p = params[param];
    if (p === undefined || p === '') {
        return undefined;
    }
    if (angular.isArray(p)) {
        return p[p.length - 1];
    } else {
        return p;
    }
}

/**
 * @param {string} param
 * @param {UrlParams} params
 * @return {string[]|undefined}
 */
export function getMultiStringParam(param, params) {
    const p = angular.isDefined(params[param]) ? params[param] : '';
    if (p === undefined || p === '') {
        return undefined;
    }
    if (!Array.isArray(p)) {
        return [p];
    } else {
        return p;
    }
}

/**
 * @param {string} param
 * @param {UrlParams} params
 * @return {string[]|undefined}
 */
export function getArrayParam(param, params) {
    const paramString = getStringParam(param, params);
    if (paramString !== undefined) {
        return paramString.split(',');
    } else {
        return undefined;
    }
}

/**
 * @param {string} paramString
 * @return {Record<string, string>}
 */
function parseObject(paramString) {
    if (paramString === '') {
        return {};
    }
    /** @type {Record<string, string>} */
    const result = {};
    for (const [key, value] of paramString.split('|').map(value => value.split(':'))) {
        result[key] = value;
    }
    return result;
}

/**
 * @param {string} param
 * @param {UrlParams} params
 * @return {Record<string, string>|undefined}
 */
export function getObjectParam(param, params) {
    const stringParam = getStringParam(param, params);
    if (stringParam === undefined) {
        return undefined;
    }
    return parseObject(stringParam);
}

/**
 * @param {string} param
 * @param {UrlParams} params
 * @return {Record<string, string>[]|undefined}
 */
export function getMultiObjectParam(param, params) {
    const stringParams = getMultiStringParam(param, params);
    if (stringParams === undefined) {
        return undefined;
    }
    return stringParams.map(parseObject);
}

/**
 * @param {Record<string, string>} object
 * @return {string}
 */
export function stringifyObject(object) {
    return Object.entries(object)
        .map(([k, v]) => `${k}:${v}`)
        .join('|');
}
