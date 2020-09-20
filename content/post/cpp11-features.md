---
title: c++11特性简介 
date: '2020-08-28'
toc : true
categories:
  - 总结 
tags:
  - c++
---

c++自1985年发行以来，以其高效、灵活的特性成为最成功的高级编程语言之一。2011年，距离上一个c++标准c++03发布的8年后，c++委员会吸取了现代编程语言的若干特性，发布了新的c++11标准，使得古朴的c++得以跻身现代编程语言的行列。本文挑选了部分c++11引入的新特性进行说明，阐述其缘由，使用以及注意事项。如果你需要查看完整特性与编译器支持请参考[这里$^{[1]}$](https://en.cppreference.com/w/cpp/compiler_support)。

# 部分特性与示例

## 1. 右值引用(rvalue references)

在C语言中，左值与右值原是极为简单的概念——凡是既可以出现在赋值语句两边的称为左值，只能出现在赋值语句右边的称为右值。例如下面的代码中，`a`和`b`是左值，`42`和`a + b`是右值。如果右值出现在赋值语句左边，则会如你所熟知的一样，产生一个编译错误。

```cpp
int a = 42;
int b = a;
42 = a + b; //compile error
a + b = a;  //compile error
```
另一种区分左值与右值的方法是，左值是哪些能被`&`操作符取到地址的值，右值是通过左值运算得出的临时结果或一些字面常量。把上面的代码编译成汇编语言就一目了然了。下面的代码中左值`a`和`b`都在栈上分配了空间，分别是`-4(%rbp)`和`-8(%rbp)`，而右值`42`是一个立即数，`a + b`则是`addl`的两个参数。

```asm
movl  $42, -4(%rbp)   ;int a = 42;
movl  -4(%rbp), %eax
movl  %eax, -8(%rbp)
movl  -8(%rbp), %eax  ;int b = a
addl  %eax, -4(rbp);  ;a = a + b
```

谈过了“右值”，我们来讨论下”引用“。使用引用是提高程序运行效率的常用手段，而在只提供左值引用的C++03时代，在某些场景下的引用并没有那么“好用”。例如下面的代码中，由于无法传递右值`Data()`的引用，我们不得不使用3行丑陋的代码来完成一个简单的工作。

```cpp
extern Data Merge(Data& data1, Data& data2);
Data double_data = Merge(Data(), Data()); //compile error
//ok, but ugly
Data data1;
Data data2;
Data double_data = Merge(data1, data2);
```

为此，C++中，提供了右值引用操作符`&&`。于是我们保留原先的左值引用版`Merge`，增加支持右值引用的`Merge`，代码可以简化成，

```cpp
extern Data Merge(Data& data1, Data& data2);
extern Data Merge(Data&& data1, Data&& data2);
Data double_data = Merge(Data(), Data()); //ok
```

然而，如果这时候我们想传入一个左值和一个右值，编译器就无法匹配对应的`Merge`了。此时需要使用`std::move`将左值`data1`转化为右值引用，

```cpp
extern Data Merge(Data& data1, Data& data2);
extern Data Merge(Data&& data1, Data&& data2);
Data data1;
Data double_data = Merge(data1, Data()); //compile error
Data double_data = Merge(std::move(data1), Data()); //ok
```

在c++03时代，我们可以对右值进行`const`引用，从而扩展右值的生命周期到引用销毁之时，但缺点是其值**不可被修改**。在c++11中，通过右值引用，我们**不仅可以延长右值的生命周期，其值也可以自由修改**。

```cpp
const int& a = 42;
a = 43; //compile error
int&&b = 42;
b = 43; //ok
```

## 2. 移动语义(move semantic)

移动语义旨在通过右值引用，实现资源的“移动"，而非先拷贝再删除，节省拷贝开销。这里注意，原资源的释放是被要求，但不是必须的。

```cpp
Data(Data&& other) {
  _res = other._res;
  other._res = nullptr;
}
```

### 2.1. std::move

使用`std::move`可以将左值转为右值，从而方便使用移动语义。**这里指的注意的是，将左值传入移动构造函数，会导致其值被释放。所以应当确保在调用移动构造后，该左值不被使用。**

```cpp
extern Data::Data(const Data& other);
extern Data::Data(Data&& other);
Data d1;
Data d2(d1); //d1 is lvalue, copy constructor
Data d2(std::move(d1)); //std::move(d1) is rvalue, move constructor
```

另外一个值得注意的问题是，有些时候我们以为是一个移动构造，但其实执行的是拷贝构造，例如下面的`_str`其实执行的是`string`的拷贝构造，这是因为发生了后文中会提到的**右值引用类型推导**，正确的做法是`_str = std::move(other._str)`。

```cpp
Data(Data&& other) {
  _str = other._str;            //copy
  _str = std::move(other._str); //correct move
}
```

## 3. 完美转发(perfect forwarding)

在泛型编程中，我们有时候需要”转发“一些参数给其他函数。比较典型的一个例子是传递一个类型和若干构造他的参数。例如下面的代码，

```cpp
template<typename T, typename ARG1, typename ARG2>
T* allocate(ARG1 arg1, ARG2 arg2) {
  return new T(arg1, arg2);
}
```

抽象一下，我们需要的是一个包裹函数`wrapper`来传递参数给`func`。

```cpp
template<typename T1, typename T2>
void wrapper(T1& e1, T2& e2) {
  func(e1, e2);
}
wrapper(42, 10);  //compile error
```

在上面的代码中，我们使用引用来传递参数以提高效率，这正是我们以前习惯的“伎俩”。然而，使用左值引用的`wrapper`对右值无能为力。为此，对于两个参数`T1`和`T2`，我们需要分别支持左值引用和右值引用的`wrapper`函数，也就是4个`wrapper`，

```cpp
template<typename T1, typename T2>
void wrapper(T1& e1, T2& e2) { func(e1, e2); }

template<typename T1, typename T2>
void wrapper(T1& e1, T2&& e2) { func(e1, e2); }

template<typename T1, typename T2>
void wrapper(T1&& e1, T2& e2) { func(e1, e2); }

template<typename T1, typename T2>
void wrapper(T1&& e1, T2&& e2) { func(e1, e2); }
```

灾难发生了，对于$n$个参数的函数来讲，需要$2^n$个特例来接受所有可能性。更可怕的是，c++11提供了可变参数模板！那我们有没有办法在**保持值类型不变进行转发**呢？完美转发正是我们想要的答案。

### 3.1. 引用折叠(reference collapsing)

在介绍完美转发之前，我想有必要先阐释下引用折叠。请首先思考一下，在下面的例子中，`r`的类型分别会是什么？

```cpp
template<typename T>
void wrapper(T t) {
 T& r = t;
}
int a = 42;
wrapper<int&>(a);
wrapper<int&&>(42);
```

对于“引用的引用”，c++11中给出了明确的解析方式，我们称之为引用折叠(reference collapsing)。具体的规则为：

```cpp
& & -> &
&& & -> &
& && -> &
&& && -> &&
```

我们可以简单记忆为，在有左值引用的`&`的情况下，最终的值类型一定是左值引用。

### 3.2. 右值引用类型推导

另外值得一提的是，在模板函数的形参为右值引用时，形参的类型取决于传入的实参类型。具体来说，我们分析下面的代码中形参`t`的类型。当传入类型左值类型`U`时，`t`的类型为`U&`。传入右值类型`U`时，`t`的类型为`U`。这既是右值引用类型推导规则。

```cpp
template <class T> void func(T&& t) {}
func(42);           // 42 is an rvalue: T deduced to int

double d = 3.14;
func(d);            // d is an lvalue; T deduced to double&
```

### 3.3. std::forward

那么回到我们的`wrapper`函数。在c++11中，对它进行完美转发的正确写法应该是下面的代码。

```cpp
template <typename T1, typename T2>
void wrapper(T1&& e1, T2&& e2) {
    func(std::forward<T1>(e1), std::forward<T2>(e2));
}
```

其中`std::forward`的实现为，

```cpp
template<class T>
T&& forward(typename std::remove_reference<T>::type& t) noexcept {
  return static_cast<T&&>(t);
}
template <class T>
T&& forward(typename std::remove_reference<T>::type&& t) noexcept {
  return static_cast<T&&>(t);
}
```

如果我们如下使用wrapper，

```cpp
int a = 42;
wrapper(a, 1.0f);
```

实参`a`的形参`e1`的类型为`int&`，所以forward特例化为如下代码，保留了左值引用类型。

```cpp
int& && forward(int& t) noexcept { return static_cast<int& &&>(t); }
```
引用折叠后，即，

```cpp
int& forward(int& t) noexcept { return static_cast<int&>(t); }
```

实参`42`的形参`e2`的类型为`int&&`，所以forward特例化为如下代码，保留了右值引用类型。

```cpp
int&& && forward(int&& t) noexcept { return static_cast<int&& &&>(t); }
```

引用折叠后，即，

```cpp
int&& forward(int&& t) noexcept { return static_cast<int&&>(t); }
```

至此，c++11通过引用折叠与右值引用类型推导实现了完美转发。

## 4. lambda表达式(lambda expressions)

lambda表达式使得我们可以更加优雅的实现一些“只需要使用一次”的函数。例如`std::sort`中常用的比较函数，

```cpp
struct Point {
  int x;
  int y;
};
vector<Point> v;
//c++03
int compByX(const Point& p1, const Point& p1) { return p1.x < p2.x; }
int compByY(const Point& p1, const Point& p1) { return p1.y < p2.y; }
sort(v.begin, v.end(), compByX);
sort(v.begin, v.end(), compByY);
//c++11
sort(v.begin, v.end(), [](const Point& p1, const Point& p1) { return p1.x < p2.x });
sort(v.begin, v.end(), [](const Point& p1, const Point& p1) { return p1.y < p2.y });
```

## 5. 自动类型推导(auto)与decltype关键字

与其他现代高级语言一样，`auto`为强类型语言实现了类似于脚本语言的自动类型推导功能。

```cpp
for (auto it = v.begin(); it != v.end(); ++ it) {
  std::cout << *it << endl;
}
```

`decltype`则提供了编译期的自动类型推导。如果你不想执行某个表达式，又想得到它的类型，那请使用`decltype`，

```cpp
decltype(a+b) c;
```

## 6. 基于range的for循环(range-based for)

```cpp
for (int& x : v) { std::cout << x << endl; }
//结合auto
for (auto& x : v) { std::cout << x << endl; } //reference
for (auto x : v) { std::cout << x << endl; }  //copy
```

## 7. 初始化列表(Initializer lists)

语法糖，方便对顺序数据结构初始化。

```cpp
//c++03
std::vector<int> v;
v.push_back(1);
v.push_back(2);
v.push_back(3);
//c++11
std::vector<int> v{1,2,3};
std::vector<int> v = {1,2,3};
//自定义初始化列表
#include <initializer_list>
class myVector {
public:
  myVector(const initializer_list<int>& v) {
    for (auto x : v) _v.push_back(x);
  }
private:
  std::vector<int> _v;
};
myVector mv{1,2,3};
myVector mv = {1,2,3};
```

## 8. 静态断言(static_assert)

安全特性，编译器静态检查。

```cpp
static_assert( sizeof(int)==4) );
```

## 9. 委托构造函数(delegating constructor)

语法糖，方便简化类的初始化行为。

```cpp
//c++03
class Foo {
public:
  Foo() { init(); }
  Foo(int x) { init(); doSomething(x); }
private:
  void init() { //to some init }
};
//c++11
class Foo {
public:
  Foo() { //to some init }
  Foo(int x) : Foo() { doSomething(x); } //Foo必须首先被调用
};
```

## 10. override关键字

安全特性，显示标识函数的”重载“属性，在编译器检查，防止无效重载。

```cpp
class Base {
  virtual void A(int x);
  virtual void B() const;
};

//c++03
class Derived : public Base {
  virtual void A(float x); //OK, create a new function
  virtual void B();        //OK, create a new function
};
//c++11
class Derived : public Base {
  virtual void A(float x) override; //Error, no funtion to override
  virtual void B() override;        //Error, no funtion to override
};
```

## 11. final关键字

提供了防止override的能力。

```cpp
struct Base {
    virtual void foo();
};

struct A : Base {
    void foo() final; // Base::foo is overridden and A::foo is the final override
    void bar() final; // Error: bar cannot be final as it is non-virtual
};

struct B final : A { // struct B is final
{
    void foo() override; // Error: foo cannot be overridden as it is final in A
};

struct C : B { // Error: B is final
};
```

## 12. delete与default关键字

提供了禁用某些成员函数的能力。

```cpp
class X {
  X& operator=(const X&) = delete;	// Disallow copying
  X(const X&) = delete;
};
```

default恢复默认无参构造函数
```cpp
class X {
  X() = default;
  X(const X&) {...};
};
```

## 13. nullptr关键字

安全特性，防止宏定义`NULL`的二义性

```cpp
void foo(int i);
void foo(void* p);
//c++98
foo(NULL); //Error，重载歧义
//c++11
foo(nullptr); //OK, 调用void foo(void* p)
```

## 14. std::标准库

### 14.1. 智能指针

为了防止使用指针过程中的空指针，野指针等常见为题，c++11增加了三种智能指针.

#### unique_ptr

保证了资源的“独占使用”，在任意时刻只能有一个unique_ptr指向资源。

```cpp
unique_ptr<string> p1(new string ("Hello"));
unique_ptr<string> p2 = p1; //error
```

我们可以使用`release`和`reset`方法来转移资源的所有权，

```cpp
unique_ptr<string> pu2.reset(p1.release());
```

此外，我们可以赋值和拷贝一个将要销毁的`unique_ptr`，例如，

```cpp
unique_ptr<string> func() {}
unique_ptr<string> p1 = func();
```

#### shared_ptr

通过引用计数实现了资源的自动释放。

```cpp
shared_ptr<string> ps1(new string ("Hello")); //ps1.use_count() = 1
ps2 = ps1;  //ps1.use_count() = 2
```

在使用时，我们需要注意禁止使用指针给智能指针赋值。下面的代码中，`p1`和`p2`分别维护引用计数，当资源释放时，会导致重复析构。

```cpp
int *a = new int(42);
shared_ptr<int> p1(a);
shared_ptr<int> p2(a);
```

此外，`shared_ptr`在使用中存在循环引用问题，如下代码展示了这一情况，

```cpp
class A {
  shared_ptr<B> _p;
public:
  setP(shared_ptr<B>& p) { _p = p };
};
class B {
  shared_ptr<A> _p;
public:
  setP(shared_ptr<A>& p) { _p = p };
};

shared_ptr<A> pA(new A);
shared_ptr<A> pB(new B);
pA->setP(pB);
pB->setP(pA);
```

#### weak_ptr

解决`shared_ptr`循环引用问题，与`shared_ptr`配合使用，不占用引用计数。

```cpp
class A {
  weak_ptr<B> _p;
public:
  setP(weak_ptr<B>& p) { _p = p };
};
class B {
  weak_ptr<A> _p;
public:
  setP(weak_ptr<A>& p) { _p = p };
};

shared_ptr<A> pA(new A);
shared_ptr<A> pB(new B);
pA->setP(pB);
pB->setP(pA);
```

### 14.2. all_of, any_of, none_of

如下例，

```cpp
all_of(v.begin(), v.end(), ispositive());
any_of(v.begin(), v.end(), ispositive());
none_of(v.begin(), v.end(), ispositive());
```

### 14.3. std::unordered_map, std::unordered_set

与`std::map`和`std::set`使用发放类似，以哈希表作为底层实现，提供$ O(1) $的插入查询效率。哈希表的负载因子(LoadFactor)超过阈值时，会自动进行rehashing，进而可能导致迭代器失效。

# 最后

在2020年，虽然最新的标准已经来到了c++20，但c++11依然具有学习的意义。在我看来其可以视为是c++迈向现代编程语言的最重要一步，也是承上启下的一个关键性版本。

最后，感谢你的阅读。如果你觉得本文有任何错误，亦或是你有任何疑虑和感想，请一定[让我知道](mailto:changliu0828@gmail.com)。

# 参考
1. [C++ compiler support, cppreference.com](https://en.cppreference.com/w/cpp/compiler_support)
2. [Value categories, cppreference.com](https://en.cppreference.com/w/cpp/language/value_category)
3. [The Biggest Changes in C++11 (and Why You Should Care)](https://smartbear.com/blog/develop/the-biggest-changes-in-c11-and-why-you-should-care/)
4. [Perfect forwarding and universal references in C++](https://eli.thegreenplace.net/2014/perfect-forwarding-and-universal-references-in-c)
