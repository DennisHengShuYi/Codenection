/**
 * §2.3's withdrawal, written in the student's own voice.
 *
 * Students do not struggle to say no because they lack a reason; they struggle because
 * saying no requires an act. By the time this is shown the decision is already made -- the
 * block is out of the week -- so all that is left is words, and the app writes them so the
 * student only has to send them.
 *
 * A template rather than a model call, which is why it is here in the domain rather than in
 * `src/ai`. This text has to exist the moment somebody decides to drop something, with no
 * network, no key and no waiting: a withdrawal message behind a spinner fails exactly when it
 * is needed. It came out of `LapsedNotice` when that card was replaced, and survived it for
 * the same reason -- the card's trigger was wrong, its sentence was not.
 *
 * Takes the title rather than a `Commitment`, so a caller holding only what the student
 * called the thing does not have to reconstruct a record to ask for words about it.
 */
export function withdrawalFor(title: string): string {
  return (
    `I need to pull out of ${title}, and I am sorry for the short notice. ` +
    'I said yes hoping the next couple of weeks would ease up and they have not. ' +
    'I would rather tell you now than do it badly or drop it later.'
  )
}
