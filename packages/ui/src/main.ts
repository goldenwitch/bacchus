import { mount } from 'svelte';
import App from './App.svelte';
import './app.css';

const appEl = document.getElementById('app');
if (appEl) {
  mount(App, { target: appEl });
}
