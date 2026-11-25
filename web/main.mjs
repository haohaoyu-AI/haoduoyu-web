import { registerEvents } from "./events.mjs";
import { init } from "./controller.mjs";
import { startServiceWorker } from "./offline/sw-client.mjs";
import { startOfflineUI } from "./offline/ui.mjs";
startOfflineUI();
registerEvents();
startServiceWorker();
init();
