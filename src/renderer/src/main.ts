import { mount } from 'svelte'

import './assets/main.css'

import Shell from './Shell.svelte'

const app = mount(Shell, {
  target: document.getElementById('app')!
})

export default app
