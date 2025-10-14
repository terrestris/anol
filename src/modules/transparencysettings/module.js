import { anol } from '../../anol/anol.js';

angular.module('anol.transparencysettings', [])
    .service('TransparencyDialogService', function() {
        let activeDialog = null;
        let dialogCounter = 0;

        return {
          openDialog: function(data) {
            activeDialog = data;
            dialogCounter++;
            return dialogCounter;
          },
          closeDialog: function() {
            activeDialog = null;
          },
          isActiveDialog: function(id) {
            return activeDialog !== null && id === dialogCounter;
          },
          isOpen: function() {
            return activeDialog !== null;
          },
          getActiveDialog: function() {
            return activeDialog;
          }
        };
      });
