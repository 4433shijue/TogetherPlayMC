export function commandFor(sender, owner, message) {
  if (sender !== owner) return null;
  const commands = new Map([
    ['!follow', 'follow'], ['跟着我', 'follow'], ['跟我来', 'follow'],
    ['!stop', 'stop'], ['停下', 'stop'], ['等我', 'stop'],
    ['!status', 'status'], ['状态', 'status'],
    ['!hello', 'hello'], ['你好', 'hello'],
    ['!help', 'help'], ['帮助', 'help']
  ]);
  return commands.get(message.trim().toLowerCase()) ?? null;
}
