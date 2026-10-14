import { render } from 'preact';
import '@vexflow-fonts/bravura/index.css';
import './styles.css';
import { App } from './app';

const mount = () => render(<App />, document.getElementById('app')!);

// Los glifos del pentagrama salen de la fuente Bravura: se espera a que cargue para no ver cuadros vacíos.
document.fonts.load('40px Bravura', '').then(mount, mount);
