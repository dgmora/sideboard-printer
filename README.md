# Sideboard Printer

**Live app: <https://dgmora.github.io/sideboard-printer/>**

A free sideboard guide template for Magic: The Gathering and other card games. It turns a sideboard guide kept in Google Sheets into a card you can print and keep in your deck box.

![example guide](./img/example_guide.png "Example Guide")

## How it works

Keep one spreadsheet with a tab per deck, named after the deck. Start from the template linked on the page, share the spreadsheet as "Anyone with the link can view" and add its link: every tab becomes a guide. Edit the sheet and the card catches up within a minute. You can also paste a sheet or CSV directly.

The template uses one count column, with separate Maindeck and Sideboard sections. List a card in both sections twice. The count beside each section title sums its copies; the Total row sums matchup changes. Add labeled note rows below Total to include matchup advice in the printed guide. The header starts on row 1; the template freezes it and the first two columns, with gray and white alternating matchup columns. Existing two-count-column sheets still work.

Each half of the guide is card-sized, 64 × 89.4 mm. Red numbers are cards to take out, green ones cards to bring in, and a `*` marks optional swaps. Guides with many matchups fold into more card-sized faces, with the card names on every face or only once. Download the PDF and print it on A4 or Letter paper at 100% scale. A 100 mm line under the guide lets you check that the printer kept the size.

Already have a guide in another format? The page has a prompt you can give an AI assistant like Claude or ChatGPT to convert it, along with your decklist.

Everything runs in your browser. Your spreadsheet is never sent anywhere else, and the page only remembers your links and the guide you picked last, on your device. You can share a guide as a live link to your spreadsheet or as a snapshot stored in the link itself.

## Local development

The app is plain HTML, CSS and JavaScript at the repository root, with no build step. With [mise](https://mise.jdx.dev/) and [just](https://github.com/casey/just) installed, run:

```sh
mise install
just server
```

Open <http://localhost:8000/>. Refresh the browser after editing files; caching is disabled, so the server doesn't need restarting.

Run the tests:

```sh
just test
```

Regenerate the example image above after changing how the card looks (needs `rsvg-convert`):

```sh
node scripts/example-image.js
```

## Contributing

Ideas, questions and feedback are best started in [Discussions](https://github.com/dgmora/sideboard-printer/discussions). Issues and pull requests are welcome too.

## Attribution

Inspired by and originally based on [sepro/MtG-Sideboard-Guides](https://github.com/sepro/MtG-Sideboard-Guides) by Sebastian Proost, which this project started as a fork of.
