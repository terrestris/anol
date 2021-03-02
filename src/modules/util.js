angular.module('anol')
    .factory('$olOn', ['$rootScope', function ($rootScope) {
        return function (olObject, event, callback) {
            return olObject.on(event, function (e) {
                $rootScope.$applyAsync(function () {
                    callback(e);
                });
            });
        }
    }]);
