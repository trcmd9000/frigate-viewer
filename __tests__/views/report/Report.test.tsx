import {Linking} from 'react-native';
import {
  buildGitHubIssueUrl,
  openGitHubIssue,
} from '../../../views/report/Report';
import {handleError} from '../../../helpers/errorHandler';

const mockScrollView = () => null;
const mockActionBar = () => null;
const mockView = () => null;
const mockFormik = () => null;
const mockInput = () => null;
const mockLabel = () => null;
const mockSection = () => null;

jest.mock('react-native-navigation', () => ({
  Navigation: {
    mergeOptions: jest.fn(),
    events: () => ({
      registerNavigationButtonPressedListener: jest.fn(() => ({
        remove: jest.fn(),
      })),
    }),
  },
}));

jest.mock('react-native-gesture-handler', () => ({
  ScrollView: mockScrollView,
}));

jest.mock('react-native-ui-lib', () => ({
  ActionBar: mockActionBar,
  View: mockView,
}));

jest.mock('formik', () => ({
  Formik: mockFormik,
}));

jest.mock('../../../components/forms/Input', () => ({
  Input: mockInput,
}));

jest.mock('../../../components/forms/Label', () => ({
  Label: mockLabel,
}));

jest.mock('../../../components/forms/Section', () => ({
  Section: mockSection,
}));

jest.mock('../../../helpers/colors', () => ({
  useStyles: () => ({}),
  useTheme: () => ({background: '#fff', link: '#00f', text: '#000'}),
}));

jest.mock('../../../views/menu/menuHelpers', () => ({
  menuButton: {id: 'menu'},
  useMenu: jest.fn(),
}));

jest.mock('../../../helpers/secondaryNavigation', () => ({
  SECONDARY_ROOT_COMPONENT_ID: 'SecondaryStackRoot',
  createSecondaryStackDismissButton: jest.fn(),
  handleSecondaryStackNavigationButton: jest.fn(),
}));

jest.mock('../../../helpers/errorHandler', () => ({
  handleError: jest.fn().mockResolvedValue(undefined),
}));

describe('report flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('URL-encodes the manually entered issue description', () => {
    const description = 'Button & label: café\nsecond line';

    expect(buildGitHubIssueUrl(description)).toBe(
      'https://github.com/trcmd9000/frigate-viewer/issues/new?body=Button%20%26%20label%3A%20caf%C3%A9%0Asecond%20line',
    );
  });

  it('resets the form only after GitHub opens successfully', async () => {
    jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    const resetForm = jest.fn();
    const showFailure = jest.fn();

    await openGitHubIssue('A problem', resetForm, showFailure);

    expect(resetForm).toHaveBeenCalledTimes(1);
    expect(showFailure).not.toHaveBeenCalled();
  });

  it('handles a failed GitHub open without resetting the form', async () => {
    const error = new Error('No browser available');
    jest.spyOn(Linking, 'openURL').mockRejectedValue(error);
    const resetForm = jest.fn();
    const showFailure = jest.fn();

    await openGitHubIssue('A problem', resetForm, showFailure);

    expect(handleError).toHaveBeenCalledWith(error, 'Report.openGitHub');
    expect(showFailure).toHaveBeenCalledTimes(1);
    expect(resetForm).not.toHaveBeenCalled();
  });
});
