# FOV Atlas

A community database of the field of view people actually see in VR headsets, measured by the
people wearing them, with what fits their face and setup.

## Why this exists

As a random person about to buy a VR headset, I had no good way to know what field of view to
expect. [hmdq](https://github.com/risa2000/hmdq) tells what a headset renders, which nobody can see
past, but what reaches your eyes is usually less, and the tools measuring it disagree:
VR Headset Picker and TestHMD follow hmdq's convention but measure differently, WIMFOV uses its own
standard, and VRChat worlds follow no clear one. On top of that, faces differ: deep-set eyes or a
flat face, nose, facial interface and cushion all change the eye relief, and so the results, while
driver tuning changes how much is rendered. My own measures with a Pimax Dream Air are far more
optimistic than most people should expect, and on sites pooling every measure together, a single
submission of mine once made the Vive Pro 1 the headset with the biggest overlap, while an even
bigger one on the Dream Air got lost in the mass.

So FOV Atlas keeps every measuring tool apart, and lets people filter by face fit and setup to get
a better idea of how much they can expect from a headset that probably fits them the same way: the
average, how much it varies, and the highest anyone has measured.

## Development

Requires the Node version in `.nvmrc` (`nvm use`).

```sh
npm ci
npm run dev     # local dev server
npm run check   # lint, typecheck, unit tests with coverage, production build
```

The first mockup of the pages lives in [docs/mockup](docs/mockup/index.html).

## Credits

The way FOV Atlas measures is heavily inspired by [VR Headset Picker](https://vrheadsetpicker.com)'s
measure, a great way of doing it. Showing a field of view as a radar chart is inspired by
[WIMFOV](https://boll.itch.io/wimfov). The "what you see" view, how a field of view looks in VR,
comes from an idea by Reddit user Heliosurge. Its cockpit is the 360° photo of the
[cockpit of an F-4 Phantom II](https://commons.wikimedia.org/wiki/File:Eesti_Lennundusmuuseum._H%C3%A4vitaja_F-4C_Phantom_II_kabiin.jpg)
at the Estonian Aviation Museum by Lauri Veerde, from Wikimedia Commons, under
[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/); `public/scenes/cockpit.webp` is
that photo reprojected and is shared under the same licence.

I described the problem and gave some technical specifications. The entire coding was done by
Claude Code, and the whole design and navigation of the site were its suggestions.

The headset catalog follows [VR Headset Picker](https://vrheadsetpicker.com)'s model ids, so its
share links can preselect the headset. The rendered field of view, what a headset itself reports
it draws for each eye, is defined as in [hmdq](https://github.com/risa2000/hmdq) by Richard Musil;
each measure is set against the rendered field of view of the headset it was taken with. What
FOV Atlas measures read from their headsets is also averaged per model, as a reference for the
tools that follow hmdq's definition.

## License

Public domain ([Unlicense](LICENSE)).
