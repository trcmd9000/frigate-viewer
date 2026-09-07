import React, {FC} from 'react';
import {TextInput, TextInputProps} from 'react-native';
import {useFormsStyles} from './styles';

type IInputProps = TextInputProps;

export const Input: FC<IInputProps> = ({style, ...inputProps}) => {
  const formsStyles = useFormsStyles();

  return (
    <TextInput
      {...inputProps}
      style={[formsStyles.input, formsStyles.inputText, style]}
    />
  );
};
