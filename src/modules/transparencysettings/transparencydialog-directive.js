import './module.js';

import templateHTML from './templates/transparencydialog.html';

angular.module('anol.transparencysettings')

    .directive('anolTransparencydialog', ['$templateRequest', '$compile', '$document', '$rootScope', 'TransparencyDialogService',
        function ($templateRequest, $compile, $document, $rootScope, TransparencyDialogService) {
            return {
                restrict: 'A',
                template: function (tElement, tAttrs) {
                    if (tAttrs.templateUrl) {
                        return '<div></div>';
                    }
                    return templateHTML;
                },
                link: function (scope, element, attrs) {

                    if (attrs.templateUrl && attrs.templateUrl !== '') {
                        $templateRequest(attrs.templateUrl).then(function (html) {
                            const template = angular.element(html);
                            element.html(template);
                            $compile(template)(scope);
                        });
                    }

                    const updateDialogPosition = function() {
                        const dialogPadding = 10;
                        const dialogWidth = element.find('#transparency-dialog')[0].getBoundingClientRect().width;
                        const dialogTop = scope.activeDialog.boundingRect.top - dialogPadding;
                        const dialogLeft = scope.activeDialog.boundingRect.left +
                            scope.activeDialog.boundingRect.width - dialogWidth + dialogPadding;
                        scope.dialogStyle = {
                            top: `${dialogTop}px`,
                            left: `${dialogLeft}px`
                        };
                    };

                    scope.activeDialog = TransparencyDialogService.getActiveDialog();
                    updateDialogPosition();

                    scope.$watch(function() {
                        return TransparencyDialogService.getActiveDialog();
                    }, function(newVal) {
                        scope.activeDialog = newVal;
                        updateDialogPosition();
                    });

                    scope.closeDialog = TransparencyDialogService.closeDialog;

                    scope.transparency = function (transparencyValue) {
                        if (!transparencyValue && transparencyValue !== 0) {
                            return 1 - scope.activeDialog.group.getUserDefinedOpacity();
                        } else {
                            scope.activeDialog.group.setUserDefinedOpacity(1 - transparencyValue);
                        }
                    };

                    const onSliderMove = function () {
                        $rootScope.sidebar = {
                            ...$rootScope.sidebar,
                            open: false
                        };
                        $rootScope.$apply();
                    };
                    const onSliderMoveEnd = function () {
                        $rootScope.sidebar = {
                            ...$rootScope.sidebar,
                            open: true
                        };
                        $rootScope.$apply();
                    };

                    const slider = element.find('#transparency-slider');
                    slider.on('touchstart', onSliderMove);
                    slider.on('touchend', onSliderMoveEnd);

                    scope.$on('$destroy', function () {
                        slider.off('touchstart', onSliderMove);
                        slider.off('touchend', onSliderMoveEnd);
                    });
                }
            };
        }]);
