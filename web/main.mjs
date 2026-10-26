import { registerEvents } from "./events.mjs";
import { init } from "./controller.mjs";
import { startServiceWorker } from "./offline/sw-client.mjs";
registerEvents();
startServiceWorker();
init();
