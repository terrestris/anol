import './module.js';

import template from './templates/drawer.html';

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
                    return template;
                },
                link: function(scope, element, attrs) {
                    if (angular.isUndefined(scope.open)) {
                        scope.open = true;
                    }
                }
            }
        }
    ]);
