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

Requires Node 22.22 or later (`nvm use`).

```sh
npm ci
npm run dev     # local dev server
npm run check   # lint, typecheck, unit tests with coverage, production build
```

See [SECURITY.md](SECURITY.md) for the security policy. The first mockup of the pages lives in
[docs/mockup](docs/mockup/index.html).

## Credits

I described the problem and gave some technical specifications. The entire coding was done by
Claude Code, and the whole design and navigation of the site were its suggestions.

## License

Public domain ([Unlicense](LICENSE)).
