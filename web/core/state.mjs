import { defaultColumns, defaultFilters } from "./constants.mjs";
const state = { me: null, savedViews: [], accounts: [], accountProfiles: [], page: "dashboard", settingsTab: "accounts", account: "",
overviewPeriod: "yesterday",
trendOpen: false, attentionExpanded: false, reviewTab: "observations", reviewArticles: [], articles: [], articleOverviewMode: "drafts",
  columns: new Set(defaultColumns), filters: defaultFilters(),
listPage: 1, pageSize: 20, topN: 5, topPlatform: "", trendMetric: "reads", todoDate: "" };
const runtime = { renderVersion: 0, lastFocus: null, searchTimer: null, activePopover: null, popoverId: 0, modalRequestVersion: 0, menuFocus: null,
entryObserver: null, entryBlocks: [], articleIndexGeneration: 0, sessionEpoch: 0 };
export {
  runtime,
  state
};
