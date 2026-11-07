<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Keep panel tablet/mobile navigation below the lg breakpoint in the shared shell, with a full Sheet menu and safe-area-aware bottom shortcuts, so every module remains reachable without squeezing the content.
- Scope touch-target and mobile input sizing to the panel theme; render weekly agenda days as stacked tiles below xl to avoid forcing a desktop calendar onto small screens.
- Persist desktop sidebar collapse only in browser storage after hydration; keep icon links labelled when collapsed so navigation remains accessible.
