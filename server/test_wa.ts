import { BaileysService } from './src/services/baileysService';

const baileysService = BaileysService.getInstance();
(async () => {
  try {
    await baileysService.connect('test_session', { force: true });

    const interval = setInterval(async () => {
       const state = await baileysService.getStatusState();
       console.log('State:', state);
       if (state.status === 'qr_ready') {
           console.log('SUCCESS: QR_READY');
           process.exit(0);
       }
       if (state.connectionState === 'error' || state.connectionState === 'closed') {
           console.log('FAILED:', state.lastError);
           process.exit(1);
       }
    }, 1500);

    setTimeout(() => {
      console.log('TIMEOUT');
      process.exit(2);
    }, 10000);
  } catch (err) {
    console.error(err);
  }
})();
