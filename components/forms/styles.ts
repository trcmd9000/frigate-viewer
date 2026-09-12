import {useStyles} from '../../helpers/colors';

export const useFormsStyles = () =>
  useStyles(({theme}) => ({
    input: {
      minHeight: 48,
      borderWidth: 1,
      borderBottomWidth: 2,
      borderColor: theme.border,
      borderRadius: 8,
      backgroundColor: theme.surface,
      paddingHorizontal: 8,
      paddingVertical: 8,
    },
    inputText: {
      color: theme.text,
    },
  }));
