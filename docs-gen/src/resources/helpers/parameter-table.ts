import { ParameterReflection } from 'typedoc';

import MarkdownTheme from '../../theme';
import { stripLineBreaks } from './strip-line-breaks';
import paramTypeToString from './param-type-to-string';

export function parameterTable(this: ParameterReflection[], hideUncommented: boolean) {
  const md = [];
  const defaultValues = this.map((param) => !!param.defaultValue);
  const hasDefaultValues = !defaultValues.every((value) => !value);

  const comments = this.map(
    (param) => (param.comment && !!param.comment.text) || (param.comment && !!param.comment.shortText)
  );
  const hasComments = !comments.every((value) => !value);

  const headers = ['Name', 'Type'];

  if (hasDefaultValues) {
    headers.push('Default');
  }

  if (hasComments) {
    headers.push('Description');
  }

  if (hideUncommented && !hasComments) {
    return '';
  }

  if (hideUncommented) {
    md.push('**Parameters:**\n');
  }

  const rows = this.map((parameter) => {
    const isOptional = parameter.flags.includes('Optional');

    const typeOut = paramTypeToString(parameter);

    const row = [
      `${parameter.flags.isRest ? '...' : ''}${parameter.name}${isOptional ? '?' : ''}`,
      typeOut ? typeOut.toString().replace(/\|/g, '&#124;') : '',
    ];
    if (hasDefaultValues) {
      row.push(parameter.defaultValue ? parameter.defaultValue : '-');
    }
    if (hasComments) {
      const commentsText = [];
      if (parameter.comment && parameter.comment.shortText) {
        commentsText.push(
          MarkdownTheme.handlebars.helpers.comment.call(stripLineBreaks.call(parameter.comment.shortText))
        );
      }
      if (parameter.comment && parameter.comment.text) {
        commentsText.push(MarkdownTheme.handlebars.helpers.comment.call(stripLineBreaks.call(parameter.comment.text)));
      }
      row.push(commentsText.length > 0 ? commentsText.join(' ') : '-');
    }
    return `${row.join(' | ')} |\n`;
  });

  md.push(`\n${headers.join(' | ')} |\n${headers.map(() => '------').join(' | ')} |\n${rows.join('')}`);

  return md.join('');
}
