// Tiny "click to reveal" quiz handler.
// Markup:
//   <div class="quiz">
//     <span class="q-tag">猜猜看</span>
//     <h4>問題？</h4>
//     <div class="options">
//       <button class="opt" data-correct>正解</button>
//       <button class="opt">錯解 1</button>
//       <button class="opt">錯解 2</button>
//     </div>
//     <div class="answer">解釋……</div>
//   </div>
(function () {
  document.addEventListener('click', (e) => {
    const opt = e.target.closest('.quiz .opt');
    if (!opt) return;
    const quiz = opt.closest('.quiz');
    if (quiz.dataset.answered === '1') return;
    quiz.dataset.answered = '1';
    const correct = opt.hasAttribute('data-correct');
    quiz.querySelectorAll('.opt').forEach(b => {
      if (b.hasAttribute('data-correct')) b.classList.add('correct');
      else if (b === opt) b.classList.add('wrong');
    });
    if (!correct) opt.classList.add('wrong');
    const ans = quiz.querySelector('.answer');
    if (ans) ans.classList.add('show');
  });
})();
