import {makeMessages} from '../../helpers/locale';

export const messages = makeMessages('author', {
  'topBar.title': 'About',
  identity: 'Frigate Viewer',
  version: 'Version {version}',
  projectSection: 'Project & support',
  project: 'Project page',
  projectHint: 'Source, documentation, and support',
  releaseNotes: 'Release notes',
  releaseNotesHint: 'See what changed in recent versions',
  legalSection: 'Legal',
  privacy: 'Privacy policy',
  appLicense: 'App license',
  appLicenseHint: 'GNU General Public License v3.0',
  thirdPartyLicenses: 'Third-party licenses',
  thirdPartyLicensesHint: 'Open-source libraries used by the app',
  disclaimer:
    'Frigate Viewer is an independent client compatible with Frigate. It is not affiliated with or endorsed by the Frigate project.',
  upstream: 'Origins',
  upstreamDescription:
    'Originally based on sp-engineering/frigate-viewer. This attribution does not imply endorsement.',
  'error.cantOpenLink': "Can't find any app to open this link.",
});
