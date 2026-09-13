/**
 * Hero copy and interface content — the single place to edit it.
 *
 * SOURCE: transcribed verbatim from Sunny's hero design reference,
 * shapes.pptx slide 1 (references/screenshots/pptx/image1.png). No wording
 * here was written for this build; line breaks follow the design.
 *
 * Anything the design does not settle is listed in `unresolvedContent` and
 * marked UNRESOLVED inline. Confirm those with Sunny before launch.
 */
export const heroContent = {
  eyebrow: 'Who we are',

  title: ['One Team, Many Talents,', 'but One Direction'],

  body: [
    'We are a team of experienced mobile app developers in India dedicated to creating customized mobile apps that will help your business stand out. We are passionate, skilled, experienced and friendly.',
    "We have been revolutionizing businesses since 2011, and it is our mission to deliver powerful solutions that meet our client's objectives.",
  ],

  cta: {
    label: 'More about us',
    // UNRESOLVED: the design does not show where the button leads. With no
    // href it renders as a button rather than a dead link.
    href: null,
  },

  stats: [
    { value: '1500+', label: ['Successful', 'Projects launched'] },
    { value: '25+', label: ['Startups we', 'helped create'] },
    { value: '500+', label: ['Clients around', 'the Globe'] },
  ],
}

export const unresolvedContent = [
  "The copy is the reference design's wording, which reads like a sample agency page. Confirm it is Sunny's final hero copy.",
  'CTA destination (heroContent.cta.href).',
  'On phones narrower than 600px the second body paragraph is hidden to keep the prism visible without scrolling.',
]
