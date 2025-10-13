import { anol } from '../../anol/anol.js';

angular.module('anol.transparencysettings', [])
    .service('TransparencyDialogService', function() {
        let activeDialog = null;
        let dialogCounter = 0;

        return {
          openDialog: function(dialogId) {
            activeDialog = dialogId;
          },
          closeDialog: function(dialogId) {
            if (activeDialog === dialogId) {
              activeDialog = null;
            }
          },
          toggleDialog: function(dialogId) {
            if (activeDialog === dialogId) {
              activeDialog = null;
            } else {
              activeDialog = dialogId;
            }
          },
          isOpen: function(dialogId) {
            return activeDialog === dialogId;
          },
          getNextDialogId: function() {
            dialogCounter += 1;
            return 'dialog-' + dialogCounter;
          }
        };
      });
