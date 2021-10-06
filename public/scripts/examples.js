//MVI - Model View Intent Pattern
//  function intent(domSource) {
//   const changeWeight$ = domSource.select('.weight').events('input')
//       .map(ev => ev.target.value)
//     const changeHeight$ = domSource.select('.height').events('input')
//       .map(ev => ev.target.value)

//   return { changeWeight$, changeHeight$ };
// }

// function model(actions) {
//   const {changeWeight$, changeHeight$} = actions;

//   return xs.combine(changeWeight$.startWith(70), changeHeight$.startWith(179))
//         .map(([weight, height]) => {
//             const heightMeters = height * 0.01;
//             const bmi = Math.round(weight / (heightMeters * heightMeters))
//             return {bmi, weight, height};
//         })
// }

// function view(state$){
//   return state$.map(state =>
//         div([
//           div([
//             label('Weight: ' + state.weight + 'kg'),
//             input('.weight', {attrs: {type: 'range', min: 40, max: 150, value: state.weight}})
//           ]),
//           div([
//             label('Height: ' + state.height + 'cm'),
//             input('.height', {attrs: {type: 'range', min: 150, max: 220, value: state.height}})
//           ]),
//           h2('BMI is ' + state.bmi)
//         ])
//     )

// }

// function main(sources) {
//   const actions = intent(sources.DOM);
//   const state$ = model(actions);
//   const vdom$ = view(state$);

//     return {
//         DOM: vdom$,
//     }
// }

// const drivers = {
//     DOM: makeDOMDriver('#main'),
// }

// Cycle.run(main, drivers);

/// MULTIPLE STREAM "state"
//  function main(sources) {
//       const changeWeight$ = sources.DOM.select('.weight').events('input')
//         .map(ev => ev.target.value)
//       const changeHeight$ = sources.DOM.select('.height').events('input')
//         .map(ev => ev.target.value)

//       const state$ = xs.combine(changeWeight$.startWith(70), changeHeight$.startWith(179))
//           .map(([weight, height]) => {
//               const heightMeters = height * 0.01;
//               const bmi = Math.round(weight / (heightMeters * heightMeters))
//               return {bmi, weight, height};
//           })

//       const vdom$ = state$.map(state =>
//           div([
//             div([
//               label('Weight: ' + state.weight + 'kg'),
//               input('.weight', {attrs: {type: 'range', min: 40, max: 150, value: state.weight}})
//             ]),
//             div([
//               label('Height: ' + state.height + 'cm'),
//               input('.height', {attrs: {type: 'range', min: 150, max: 220, value: state.height}})
//             ]),
//             h2('BMI is ' + state.bmi)
//           ])
//       )
//       return {
//           DOM: vdom$,
//       }
//   }

//   const drivers = {
//       DOM: makeDOMDriver('#main'),
//   }

//   Cycle.run(main, drivers);

// // FETCH HTTP EXAMPLE

// function main(sources) {
//     const click$ = sources.DOM.select('.get-first').events('click');

//     const request$ = click$.map(ev =>
//         ({
//             url:'https://api.starwars.run/api/people/1',
//             method: 'GET',
//             category: 'user-data',
//         })
//     );

//     const response$ = sources.HTTP
//         .select('user-data')
//         .flatten()
//         .map(res => res.body);

//     const vdom$ = response$.startWith({}).map(response =>
//         div([
//           button('.get-first', 'Get first person'),
//           div('.user-details', [
//             h1('.user-name', response.name),
//             h4('.user-email', response.hair_color),
//             a('.user-website', {attrs: {href: response.home_world}}, response.home_world)
//           ])
//         ])
//     )

//     return {
//       DOM: vdom$,
//       HTTP: request$,
//     }
// }

// const drivers = {
//     DOM: makeDOMDriver('#main'),
//     HTTP: makeHTTPDriver(),
// }

// Cycle.run(main, drivers);

//COUNT EXAMPLE
// function main(sources) {
//     const mouseover$ = sources.DOM.select('span').events('mouseover');
//     return {
//         DOM: mouseover$.startWith(null).map(() =>
//             xs.periodic(1000)
//              .fold(prev => prev + 1, 0)
//           ).flatten()
//              .map(i =>
//                h1([
//                  span([
//                     `Seconds elapsed: ${i}`
//                 ])
//               ])
//             ),

//          log: xs.periodic(2000)
//            .fold(prev => prev + 1, 0)
//     }
// }
// function logDriver(msg$) {
//     msg$.subscribe({ next: msg => { console.log(msg); }})
// }

// Cycle.run(main, {
//     DOM: makeDOMDriver('#app'),
//     log: logDriver,
// });

// HELLO INput example
//  function main(sources) {

// // -------------------->
// // ''---w---wo---wor----->
// // div--div--div--div---->

// const inputEv$ = sources.DOM.select('.field').events('input');
// const name$ = inputEv$.map(ev => ev.target.value).startWith('')

// return {
//     DOM: name$.map(name =>
//       div([
//         label(['Name:']),
//         input('.field', {attrs: {type: 'text'}}),
//         hr(),
//         h1('Hello ' + name +'!')
//       ])
//     )
//   }
// }

// const drivers = {
//     DOM: makeDOMDriver('#main')
// }

// Cycle.run(main, drivers);
