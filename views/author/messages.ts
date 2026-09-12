import {makeMessages} from '../../helpers/locale';

export const messages = makeMessages('author', {
  'topBar.title': 'About',
  identity: 'Frigate Viewer',
  maintainer: 'Maintained by trcmd9000',
  contact: 'Contact maintainer',
  privacy: 'Privacy policy',
  source: 'Source code and license',
  disclaimer:
    'Frigate Viewer is an independent client compatible with Frigate. It is not affiliated with or endorsed by the Frigate project.',
  upstream: 'Original upstream attribution',
  upstreamDescription:
    'Originally based on sp-engineering/frigate-viewer. This attribution does not imply endorsement.',
  'error.cantOpenLink': "Can't find any app to open this link.",
});
