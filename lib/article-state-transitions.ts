type TransitionTable = Readonly<Record<string, readonly string[]>>;

const articleTransitions: TransitionTable = {
  failed: ['processing', 'word_ready', 'toutiao_saving'],
  needs_login: ['processing', 'word_ready', 'toutiao_saving', 'needs_verification'],
  needs_verification: ['word_ready', 'toutiao_saving', 'needs_login', 'needs_verification'],
  toutiao_saving: ['word_ready', 'needs_login', 'needs_verification', 'failed'],
  completed: ['word_ready', 'toutiao_saving', 'needs_login', 'needs_verification', 'failed'],
};

const deliveryTransitions: TransitionTable = {
  saving: ['pending', 'saving', 'needs_verification'],
  needs_login: ['pending', 'saving', 'needs_verification'],
  needs_verification: ['pending', 'saving', 'needs_verification'],
  failed: ['saving'],
  saved: ['pending', 'saving', 'needs_verification', 'needs_login', 'failed'],
};

export function canTransitionArticleStatus(from: string, to: string) {
  return articleTransitions[to]?.includes(from) ?? false;
}

export function canTransitionDeliveryStatus(from: string, to: string) {
  return deliveryTransitions[to]?.includes(from) ?? false;
}
