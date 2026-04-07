import { createListenerMiddleware } from '@reduxjs/toolkit';

const debugMiddleware = createListenerMiddleware();

debugMiddleware.startListening({
  predicate: () => true, // it'll track every change
  effect: (action, listenerApi) => {
    // Only log action type and payload to avoid stack overflow from serializing large state
    console.debug('---redux action---');
    console.debug('action', action.type);
    // Avoid logging full payload/state which can cause stack overflow with circular refs
    // console.debug('action.payload', action.payload);
    // console.debug(listenerApi.getState());
  }
});

export default debugMiddleware;
