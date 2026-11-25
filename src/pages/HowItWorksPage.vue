<script setup lang="ts">
import { onMounted, useTemplateRef, watch } from 'vue'
import FaceFitDrawing from '../components/FaceFitDrawing.vue'
import { eyeDepthOptions } from '../components/faceFit.ts'
import { routeHref, type MethodSection } from '../lib/hashRoute.ts'

const props = withDefaults(defineProps<{ readonly section?: MethodSection | null }>(), { section: null })
const credits = useTemplateRef<HTMLElement>('credits')

// The fragment holds the route, so a link to a section is scrolled to here.
function scrollToSection(): void {
  if (props.section === 'credits') credits.value?.scrollIntoView()
}
onMounted(scrollToSection)
watch(() => props.section, scrollToSection, { flush: 'post' })
</script>

<template>
  <article class="prose">
    <h1>How it works</h1>

    <h2>Why this site exists</h2>
    <p>
      About to buy a VR headset, how do you get a good idea of the field of view you'll actually get? Today, you can't
      really.
    </p>
    <ul>
      <li>
        <b>What's drawn isn't what you see.</b>
        <a
          href="https://github.com/risa2000/hmdq"
          target="_blank"
          rel="noopener noreferrer"
        >hmdq</a> reads what a
        headset reports it draws: its rendered field of view. Nobody sees more than that, and what reaches the eyes is
        usually less.
      </li>
      <li>
        <b>The tools disagree.</b> Each measuring tool decides differently when you've reached the edge, so the same
        person in the same headset gets different numbers from each.
      </li>
      <li>
        <b>Faces differ.</b> Deep-set eyes or a flat face, the nose, the facial interface and its cushion: all of them
        change how close the eyes sit to the lenses, and so how much they see. One person's result can be far out of
        reach for someone else.
      </li>
      <li>
        <b>Pooled results mislead.</b> When every measure is mixed together, a single one can put a headset at the top
        of a ranking, while an even bigger one on another headset gets lost in the mass.
      </li>
    </ul>
    <p>
      So here, everyone adds their measure with the tool they used and a few simple details about their face and
      setup. You then look at measures from people whose headset probably fits them the way it fits you, one tool at a
      time: the average, how much it varies, and the highest anyone has measured.
    </p>

    <h2>What is measured</h2>
    <p>
      Field of view is how much of the image you actually see, in degrees. Headset makers advertise one number, but
      what you really get depends on how the headset sits on your face. That's what this site collects.
    </p>
    <p>
      A measure gives an angle for each direction: left, right, up, down, and for some tools the diagonals in between.
      Joined together, these angles draw the shape of what you see. On the radar, the highest of a headset is the one
      measure wider than all the others that match your filters, drawn whole, so its shape is one somebody actually saw.
      The mean takes the average angle in each direction.
    </p>

    <h2>One tool at a time</h2>
    <p>
      Each measuring tool is its own standard, a bit like shoe sizes from different brands. So you always pick one
      tool, and everything you see comes from that tool only. Numbers from different tools are never shown together,
      never converted into one another and never averaged.
    </p>
    <p>One reason they differ is how each tool decides you've reached the edge:</p>
    <ul>
      <li>
        <b><a
          href="https://vrheadsetpicker.com/"
          target="_blank"
          rel="noopener noreferrer"
        >VR Headset Picker</a></b>
        keeps asking whether you can still see a line, and keeps the last spot you said yes to.
      </li>
      <li>
        <b><a
          href="https://boll.itch.io/wimfov"
          target="_blank"
          rel="noopener noreferrer"
        >WIMFOV</a></b> lets you push
        the marker out yourself, as far as you like: where you stop is up to you. It measures sixteen directions per
        eye, so its shape shows best what you see.
      </li>
      <li>
        <b><a
          href="https://knob2001.itch.io/testhmd"
          target="_blank"
          rel="noopener noreferrer"
        >TestHMD</a></b> moves a
        dot out to both sides at once until you can't see it. It's a rough measure: both eyes together, horizontal and
        vertical only. Its tiny dot can vanish on some headsets while a line would still show.
      </li>
    </ul>

    <h2>Staring ahead or looking around</h2>
    <p>
      Keeping your eyes on the centre usually gives the widest result. Glancing toward the marker tends to give a
      little less, because the lens image shifts as the eye turns. Each measure says which one was done, and you can
      filter on it.
    </p>

    <h2>Reading the numbers</h2>
    <ul>
      <li><b>Horizontal</b>: from the far left the left eye sees to the far right the right eye sees.</li>
      <li><b>Vertical</b>: from top to bottom, for the eye that sees more.</li>
      <li><b>Overlap</b>: the part both eyes see at once. That's where things look 3D.</li>
      <li>
        <b>Width and height of each eye</b>: VR Headset Picker measures each eye from the centre of that eye's picture,
        not from straight ahead. Some headsets turn each eye's picture outward, and then a left eye's angle and a right
        eye's angle don't start from the same place, so its figures are given for each eye on its own.
      </li>
    </ul>

    <h2>What the headset draws</h2>
    <p>
      Each measure is set against the rendered field of view of the headset it was taken with: what that headset
      reports it draws. Nobody can see past it, so it's the most anyone can get with that headset and its settings.
    </p>
    <ul>
      <li>
        <b>FOV Atlas</b> reads it while you measure. The radar draws it as a dotted outline around each eye's picture.
      </li>
      <li>
        <b>VR Headset Picker</b> links carry it too. Each eye's width and height are set against that same eye's
        picture, and the horizontal and overlap of both eyes are shown exactly as the link gives them.
      </li>
      <li><b>WIMFOV and TestHMD</b> carry no report from the headset.</li>
    </ul>
    <p>
      What FOV Atlas measures read is also averaged for each headset model, leaving out measures with driver tuning.
      This average comes from the headsets themselves, not from what anyone saw, so it serves as a reference for FOV
      Atlas, VR Headset Picker and TestHMD, which all follow the same definition: a dotted outline on the radar, optional
      columns on Compare, and a section on each headset page. WIMFOV uses another standard and doesn't show it. When
      units of a model report noticeably different pictures, the headset page says by how much.
    </p>

    <h2>Driver tuning</h2>
    <p>
      Driver settings change how much the headset draws: they change its rendered field of view. They never change
      how the headset fits a face. Only the shape of the face, the facial interface and its cushion change how close
      the eyes sit to the lenses.
    </p>

    <h2>Why the face matters</h2>
    <p>
      Deep-set eyes sit further from the lenses and see less. That's why each measure comes with two simple questions
      about the face, so you can look at measures from people whose headset probably fits them the way it fits you.
    </p>
    <ul class="face-fit">
      <li
        v-for="option in eyeDepthOptions"
        :key="option.value"
      >
        <FaceFitDrawing
          feature="eye-depth"
          :value="option.value"
        />
        <b>{{ option.label }}</b>
        <span class="small muted">{{ option.hint }}</span>
      </li>
    </ul>

    <h2>Sending a measure</h2>
    <p>
      Measures are sent as GitHub issues, so it takes a free
      <a
        href="https://github.com/signup"
        target="_blank"
        rel="noopener noreferrer"
      >GitHub account</a>. The GitHub
      name a measure is posted under is shown next to it, and a <code>/withdraw</code> comment on the issue removes it
      at any time. <a :href="routeHref({ page: 'submit' })">Add a measure</a>.
    </p>
    <p>
      No GitHub account? You can still measure, keep the result as a link, a text or a file, and compare with it. It
      just isn't published.
    </p>

    <section
      ref="credits"
      aria-labelledby="credits-heading"
    >
      <h2 id="credits-heading">
        Credits
      </h2>
      <p>FOV Atlas stands on the work and ideas of others:</p>
      <ul>
        <li>
          The way FOV Atlas measures is heavily inspired by the measure of
          <a
            href="https://vrheadsetpicker.com/"
            target="_blank"
            rel="noopener noreferrer"
          >VR Headset Picker</a>: a
          great way of doing it.
        </li>
        <li>
          Showing a field of view as a radar chart is inspired by
          <a
            href="https://boll.itch.io/wimfov"
            target="_blank"
            rel="noopener noreferrer"
          >WIMFOV</a>.
        </li>
        <li>The “what you see” view, how a field of view looks in VR, comes from an idea by Reddit user Heliosurge.</li>
        <li>
          Its cockpit is the 360° photo
          <a
            href="https://commons.wikimedia.org/wiki/File:Eesti_Lennundusmuuseum._H%C3%A4vitaja_F-4C_Phantom_II_kabiin.jpg"
            target="_blank"
            rel="noopener noreferrer"
          >cockpit of an F-4 Phantom II</a>
          at the Estonian Aviation Museum by Lauri Veerde, from Wikimedia Commons, under
          <a
            href="https://creativecommons.org/licenses/by-sa/4.0/"
            target="_blank"
            rel="noopener noreferrer"
          >CC BY-SA 4.0</a>. The site shows it reprojected, and that image is shared under the same licence.
        </li>
        <li>
          The headset list follows VR Headset Picker's names for each model, so its links can preselect the headset.
        </li>
        <li>
          The rendered field of view, what a headset itself reports it draws for each eye, is defined as in
          <a
            href="https://github.com/risa2000/hmdq"
            target="_blank"
            rel="noopener noreferrer"
          >hmdq</a>
          by Richard Musil.
        </li>
      </ul>
    </section>
  </article>
</template>

<style scoped>
.prose p,
.prose li {
  max-width: 72ch;
}
.face-fit {
  list-style: none;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 10px;
  max-width: 72ch;
}
.face-fit li {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px;
  background: var(--surface);
}
</style>
