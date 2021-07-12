import './module.js';

angular.module('anol.drawer')
    .directive('anolDrawer', [
        function() {
            return {
                restrict: 'A',
                scope: {
                    'open': '<?',
                    'label': '<?'
                },
                replace: true,
                transclude: true,
                template: function(tElement, tAttrs) {
                    if (tAttrs.templateUrl) {
                        return '<div></div>';
                    }
                    return require('./templates/drawer.html');
                },
                link: function(scope, element, attrs) {
                    if (angular.isUndefined(scope.open)) {
                        scope.open = true;
                    }
                }
            }
        }
    ]);
