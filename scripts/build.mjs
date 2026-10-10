import { build } from 'esbuild';
import { mkdir, copyFile, cp, writeFile, readFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
await mkdir('vendor', { recursive: true });
await build({ stdin: { contents: 'export { createClient } from "@supabase/supabase-js";', resolveDir: process.cwd() }, bundle: true, format: 'esm', platform: 'browser', target: 'es2022', outfile: 'vendor/supabase.js', minify: true, legalComments: 'eof' });
// dist é exclusivamente gerado pelo build; limpa versões antigas e demonstrações.
await rm(new URL('../dist/', import.meta.url), { recursive: true, force: true });
await mkdir('dist', { recursive: true });
for (const file of ['index.html', 'app.js', 'ui.js', 'cloud.js', 'domain.js', 'style.css', 'config.js', '_headers']) await copyFile(file, `dist/${file}`);
for (const dir of ['vendor', 'assets']) await cp(dir, `dist/${dir}`, { recursive: true });
await writeFile('dist/.nojekyll', '');
await build({ entryPoints:['app.js'], bundle:true, format:'esm', platform:'browser', target:'es2022', outfile:'dist/app.js', minify:true, legalComments:'eof' });
// Trocar o nome quando o conteúdo mudar evita reutilizar arquivos antigos no celular.
let html = await readFile('dist/index.html', 'utf8');
for (const file of ['style.css', 'config.js', 'app.js']) {
    const bytes = await readFile(`dist/${file}`);
    const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 12);
    const versioned = file.replace(/\.(css|js)$/, `.${hash}.$1`);
    await writeFile(`dist/${versioned}`, bytes);
    html = html.replaceAll(`"${file}"`, `"${versioned}"`);
}
await writeFile('dist/index.html', html);
console.log('Site pronto em dist/. Publique somente esta pasta.');
