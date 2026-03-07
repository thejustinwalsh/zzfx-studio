declare module '@snapp-notes/react-native-syntax-highlighter' {
  import { ComponentType } from 'react';
  const SyntaxHighlighter: ComponentType<any>;
  export default SyntaxHighlighter;
}

declare module 'react-syntax-highlighter/dist/esm/styles/prism/okaidia' {
  const style: Record<string, any>;
  export default style;
}
