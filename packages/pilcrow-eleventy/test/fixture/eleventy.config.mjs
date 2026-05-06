import pilcrowEleventy from '../../dist/index.js';

export default function (eleventyConfig) {
  eleventyConfig.addPlugin(pilcrowEleventy, {});

  return {
    dir: {
      input: 'src',
      output: '_site',
      includes: '_includes',
    },
    markdownTemplateEngine: 'njk',
    htmlTemplateEngine: 'njk',
  };
}
