import { mount } from 'svelte'

import './assets/main.css'

import Picker from './Picker.svelte'

const app = mount(Picker, {
  target: document.getElementById('app')!
})

export default app
