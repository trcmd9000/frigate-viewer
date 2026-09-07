import {makeMessages} from '../../helpers/locale';

export const messages = makeMessages('eventsFilters', {
  'cameras.title': 'Cameras',
  'labels.title': 'Labels',
  'zones.title': 'Zones',
  'miscellaneous.title': 'Miscellaneous',
  'miscellaneous.retained.label': 'Retained',
  'screen.title': 'Filter events',
  'screen.label': 'Event filters',
  'active.clear': 'Clear filters',
  'active.none': 'All events',
  'active.count': '{count, plural, one {# active filter} other {# active filters}}',
  'active.remove': 'Remove filter {value}',
  'active.removeHint': 'Removes this filter',
});
