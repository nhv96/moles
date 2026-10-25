import { greeting } from './greeting';

const root = document.querySelector<HTMLDivElement>('#app');
if (root) {
  root.textContent = greeting();
}
