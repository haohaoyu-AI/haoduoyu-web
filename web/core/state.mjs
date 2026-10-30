import { defaultColumns, defaultFilters } from "./constants.mjs";
const state = { me: null, savedViews: [], accounts: [], accountProfiles: [], page: "review", settingsTab: "workspace", account: "V字",
overviewPeriod: "yesterday",
trendOpen: false, attentionExpanded: false, reviewTab: "observations", reviewArticles: [], articles: [], articleOverviewMode: "published",
  columns: new Set(defaultColumns), filters: defaultFilters(),
listPage: 1, pageSize: 20, topN: 5, topPlatform: "", trendMetric: "reads", todoDate: "" };
const runtime = { renderVersion: 0, lastFocus: null, activePopover: null, popoverId: 0, modalRequestVersion: 0, menuFocus: null,
entryObserver: null, entryBlocks: [], articleIndexGeneration: 0, sessionEpoch: 0 };
export {
  runtime,
  state
};
