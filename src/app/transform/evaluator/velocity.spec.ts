import { renderTemplate, TemplateError, TemplateValue } from './velocity';

function render(template: string, vars: Record<string, TemplateValue> = {}): TemplateValue {
  return renderTemplate(template, new Map(Object.entries(vars)));
}

describe('renderTemplate', () => {
  it('renders the directives the old subset could not', () => {
    expect(render('#foreach($c in ["a","b"])$c$foreach.count#end')).toBe('a1b2');
    expect(render('#set($n = $len + 1)$n', { len: 2 })).toBe('3');
    expect(render('#set($g = "Hi $name")$g', { name: 'Ada' })).toBe('Hi Ada');
    expect(render('#macro(tag $v)[$v]#end#tag("x")')).toBe('[x]');
  });

  it('fails on an undefined or null reference, even when quiet', () => {
    expect(() => render('Hello $name!', { name: null })).toThrow(TemplateError);
    expect(() => render('x$missing y')).toThrow(TemplateError);
    expect(() => render('#set($forceNull = null)$forceNull')).toThrow(TemplateError);
    expect(() => render('Hello $!name!', { name: null })).toThrow(TemplateError);
    expect(render('Hello $!name!', { name: '' })).toBe('Hello !');
  });

  it('answers Java String methods', () => {
    const name = { name: 'Ada Lovelace' };
    expect(render('$name.length()', name)).toBe('12');
    expect(render('$name.substring(0, $name.indexOf(" "))', name)).toBe('Ada');
    expect(render('$name.split(" ")[1]', name)).toBe('Lovelace');
    expect(render('$name.split(" ").size()', name)).toBe('2');
    expect(render('$name.replace(".", "-")', { name: 'a.b.c' })).toBe('a-b-c');
    expect(render('$name.replaceAll("[aeiou]", "")', name)).toBe('Ad Lvlc');
    expect(render('#if($name.matches("[A-Z].*"))yes#end', name)).toBe('yes');
    expect(render('$name.equalsIgnoreCase("ADA LOVELACE")', name)).toBe('true');
    expect(render('$name.charAt(4)', name)).toBe('L');
  });

  it('drops trailing empty parts when splitting, like Java', () => {
    expect(render('$v.split(",").size()', { v: 'a,b,,' })).toBe('2');
  });

  it('fails where Java throws instead of trimming the range', () => {
    expect(() => render('$v.substring(0, 10)', { v: 'abc' })).toThrow(TemplateError);
  });

  it('treats only null and false as false in #if, like the tenant', () => {
    expect(render('#if($x)yes#{else}no#end', { x: '' })).toBe('yes');
    expect(render('#if($x)yes#{else}no#end', { x: null })).toBe('no');
    expect(render('#if(!$x && $y)yes#{else}no#end', { x: false, y: '' })).toBe('yes');
  });

  it('reports unreadable templates as template errors', () => {
    expect(() => render('#if($x')).toThrow(TemplateError);
  });
});
