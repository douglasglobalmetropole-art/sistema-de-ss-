(function(){
    'use strict';

    const KEY = 'cgm-global-ss-theme';
    const root = document.documentElement;

    function read(){
        try {
            return localStorage.getItem(KEY)==='dark'
                ? 'dark' : 'light';
        } catch(e){
            return 'light';
        }
    }

    function apply(theme,save){
        root.dataset.cgmTheme=theme;

        if(save){
            try {
                localStorage.setItem(KEY,theme);
            } catch(e){}
        }

        const b=document.getElementById('cgmThemeToggle');

        if(b){
            const dark=theme==='dark';

            b.textContent=dark
                ? '\u2600 Tema claro'
                : '\u263E Tema escuro';

            b.title=dark
                ? 'Ativar tema claro'
                : 'Ativar tema escuro';

            b.setAttribute('aria-pressed',String(dark));
        }
    }

    apply(read(),false);

    function init(){
        const old=document.getElementById('siscomConsultaTop');

        if(!old || document.getElementById('cgmThemeToggle'))
            return;

        const b=document.createElement('button');

        b.type='button';
        b.id='cgmThemeToggle';
        b.className='btn';

        old.before(b);

        b.addEventListener('click',()=>{
            apply(
                root.dataset.cgmTheme==='dark'
                    ? 'light' : 'dark',
                true
            );
        });

        apply(read(),false);
    }

    if(document.readyState==='loading'){
        document.addEventListener('DOMContentLoaded',init);
    }else{
        init();
    }
})();
