renderMathInElement(document.querySelector('main'), {
  delimiters: [
    { left: '\\[', right: '\\]', display: true },
    { left: '\\(', right: '\\)', display: false }
  ],
  output: 'mathml',
  throwOnError: false
});
